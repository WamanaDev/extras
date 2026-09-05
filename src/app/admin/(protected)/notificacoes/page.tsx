'use client';

/**
 * `/admin/notificacoes` — envio manual de notificação (in-app + push
 * best-effort) para um ou mais colaboradores. Não é gatilho de negócio
 * (nenhuma extra/escala envolvida) — texto livre escolhido pelo admin.
 * `POST /api/admin/notificacoes` reaproveita `criarNotificacao` (mesmo ponto
 * de entrada de qualquer feature futura).
 */
import { useMemo, useState } from 'react';
import { useListaApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Button } from '@/components/ui/button';
import { post, type ErroApi } from '@/lib/api/client';

interface ColaboradorListado {
  id: string;
  nome: string;
  matricula: string;
  rt: { id: string; nome: string };
  ativo: boolean;
}

interface RespostaEnvio {
  enviadas: number;
  colaboradorIds: string[];
}

export default function NotificacoesAdminPage(): JSX.Element {
  const [busca, setBusca] = useState('');
  const colaboradores = useListaApi<ColaboradorListado>(
    `/api/admin/colaboradores?tamanho=200&ativo=true${busca.trim() ? `&q=${encodeURIComponent(busca.trim())}` : ''}`,
  );

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [link, setLink] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [sucesso, setSucesso] = useState<RespostaEnvio | null>(null);

  const itens = useMemo(() => colaboradores.dados?.itens ?? [], [colaboradores.dados]);
  const todosSelecionados = itens.length > 0 && itens.every((c) => selecionados.has(c.id));

  function alternar(id: string): void {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarTodos(): void {
    setSelecionados((atual) => {
      if (todosSelecionados) return new Set();
      const novo = new Set(atual);
      for (const c of itens) novo.add(c.id);
      return novo;
    });
  }

  async function enviar(): Promise<void> {
    setEnviando(true);
    setErro(null);
    setSucesso(null);

    const resultado = await post<RespostaEnvio>('/api/admin/notificacoes', {
      colaboradorIds: Array.from(selecionados),
      titulo: titulo.trim(),
      mensagem: mensagem.trim(),
      ...(link.trim() ? { link: link.trim() } : {}),
    });

    setEnviando(false);

    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }

    setSucesso(resultado.dados);
    setSelecionados(new Set());
    setTitulo('');
    setMensagem('');
    setLink('');
  }

  const podeEnviar = selecionados.size > 0 && titulo.trim().length > 0 && mensagem.trim().length > 0 && !enviando;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Notificações</h1>
        <p className="mt-1 text-sm text-slate-600">
          Envie uma notificação para um ou mais colaboradores. Aparece no sino do painel deles e, se tiverem push
          ativado no navegador, também como notificação do sistema.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Colaboradores {selecionados.size > 0 ? `(${selecionados.size} selecionado(s))` : ''}
            </h2>
            <input
              type="search"
              placeholder="Buscar por nome ou matrícula"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              className="w-64 rounded border border-slate-300 p-2 text-sm"
            />
          </div>

          {colaboradores.carregando ? (
            <EstadoCarregando />
          ) : colaboradores.erro ? (
            <EstadoErro mensagem={colaboradores.erro} />
          ) : itens.length === 0 ? (
            <EstadoVazio texto="Nenhum colaborador encontrado." />
          ) : (
            <div className="max-h-[28rem] overflow-y-auto rounded border border-slate-100">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="w-8 p-2">
                      <input type="checkbox" checked={todosSelecionados} onChange={alternarTodos} aria-label="Selecionar todos" />
                    </th>
                    <th className="p-2">Nome</th>
                    <th className="p-2">Matrícula</th>
                    <th className="p-2">RT</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((c) => (
                    <tr
                      key={c.id}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                      onClick={() => alternar(c.id)}
                    >
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selecionados.has(c.id)}
                          onChange={() => alternar(c.id)}
                          aria-label={`Selecionar ${c.nome}`}
                        />
                      </td>
                      <td className="p-2 font-medium text-slate-900">{c.nome}</td>
                      <td className="p-2">{c.matricula}</td>
                      <td className="p-2">{c.rt.nome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="h-fit rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Mensagem</h2>
          <form
            className="space-y-3"
            onSubmit={(evento) => {
              evento.preventDefault();
              void enviar();
            }}
          >
            <label className="flex flex-col text-sm">
              Título
              <input
                required
                maxLength={200}
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="mt-1 rounded border border-slate-300 p-2"
              />
            </label>
            <label className="flex flex-col text-sm">
              Mensagem
              <textarea
                required
                maxLength={2000}
                rows={4}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                className="mt-1 rounded border border-slate-300 p-2"
              />
            </label>
            <label className="flex flex-col text-sm">
              Link (opcional)
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="/painel"
                className="mt-1 rounded border border-slate-300 p-2"
              />
            </label>

            <Button type="submit" className="w-full" disabled={!podeEnviar} aria-busy={enviando}>
              {enviando ? 'Enviando…' : `Enviar para ${selecionados.size || ''} colaborador(es)`}
            </Button>

            {erro ? (
              <p role="alert" className="text-sm text-red-800">
                {erro.mensagem}
              </p>
            ) : null}
            {sucesso ? (
              <p role="status" className="text-sm text-emerald-700">
                Notificação enviada para {sucesso.enviadas} colaborador(es).
              </p>
            ) : null}
          </form>
        </section>
      </div>
    </div>
  );
}
