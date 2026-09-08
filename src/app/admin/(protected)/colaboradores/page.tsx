'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { useListaApi, useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { post, type ErroApi } from '@/lib/api/client';

interface ColaboradorListado {
  id: string;
  nome: string;
  matricula: string;
  rt: { id: string; nome: string };
  turnoPadrao: string;
  ativo: boolean;
  pinDefinido: boolean;
  bloqueado: boolean;
}

interface FormularioCriar {
  matricula: string;
  nome: string;
  rtId: string;
  turnoPadrao: 'DIURNO' | 'NOTURNO';
  escalaAncora: string;
}

const FORM_VAZIO: FormularioCriar = { matricula: '', nome: '', rtId: '', turnoPadrao: 'DIURNO', escalaAncora: '' };

/** `/admin/colaboradores` — FE-001, API-ADM-COL-001..004. */
export default function ColaboradoresPage(): JSX.Element {
  const [busca, setBusca] = useState('');
  const colaboradores = useListaApi<ColaboradorListado>(
    `/api/admin/colaboradores?tamanho=100${busca.trim() ? `&q=${encodeURIComponent(busca.trim())}` : ''}`,
  );

  const rts = useRecursoApi<{ itens: { id: string; nome: string }[] }>('/api/admin/rts');
  const [form, setForm] = useState<FormularioCriar>(FORM_VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultadoImportacao, setResultadoImportacao] = useState<{ validos: number; importados?: number; erros: Array<{ linha: number; problema: string }> } | null>(
    null,
  );
  const [erroImportacao, setErroImportacao] = useState<string | null>(null);

  async function criar(): Promise<void> {
    setEnviando(true);
    setErro(null);
    const resultado = await post<{ colaborador: unknown }>('/api/admin/colaboradores', form);
    setEnviando(false);
    if (resultado.ok) {
      setForm(FORM_VAZIO);
      colaboradores.recarregar();
    } else {
      setErro(resultado.erro);
    }
  }

  async function importar(preview: boolean): Promise<void> {
    if (!arquivo) return;
    setImportando(true);
    setErroImportacao(null);
    const formData = new FormData();
    formData.append('arquivo', arquivo);
    formData.append('preview', preview ? 'true' : 'false');
    const resposta = await fetch('/api/admin/colaboradores/importar', {
      method: 'POST',
      body: formData,
      headers: { 'X-Requested-With': 'fetch' },
      credentials: 'same-origin',
    });
    const corpo = await resposta.json();
    setImportando(false);
    if (!resposta.ok) {
      setErroImportacao(corpo?.mensagem ?? 'Falha ao importar o arquivo.');
      return;
    }
    setResultadoImportacao(corpo);
    if (!preview) colaboradores.recarregar();
  }

  /**
   * Modelo de CSV pra download — as colunas `rt`/`turno`/`ancora` já são
   * texto (nome da RT, DIURNO/NOTURNO, AAAA-MM-DD), nunca UUID (a rota de
   * importação resolve a RT pelo nome, case-insensitive — ver
   * `src/app/api/admin/colaboradores/importar/route.ts`). Gera uma linha de
   * exemplo por RT cadastrada (até 2) pra já mostrar nomes reais de RT;
   * sem cabeçalho — o parser da importação trata toda linha não vazia como
   * dado, não pula a primeira.
   */
  function baixarModeloCsv(): void {
    const rtsExemplo = (rts.dados?.itens ?? []).slice(0, 2);
    const nomesExemplo = rtsExemplo.length > 0 ? rtsExemplo.map((rt) => rt.nome) : ['RT1', 'RT2'];
    const hoje = new Date().toISOString().slice(0, 10);
    const linhas = nomesExemplo.map(
      (nomeRt, indice) => `00000${indice + 1};Nome Completo ${indice + 1};${nomeRt};${indice % 2 === 0 ? 'DIURNO' : 'NOTURNO'};${hoje}`,
    );
    const conteudo = `${linhas.join('\r\n')}\r\n`;
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo-colaboradores.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Colaboradores</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Novo colaborador</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            void criar();
          }}
        >
          <label className="flex flex-col text-sm">
            Matrícula
            <input required value={form.matricula} onChange={(e) => setForm((a) => ({ ...a, matricula: e.target.value }))} className="w-32 rounded border border-slate-300 p-2" />
          </label>
          <label className="flex flex-col text-sm">
            Nome
            <input required value={form.nome} onChange={(e) => setForm((a) => ({ ...a, nome: e.target.value }))} className="w-56 rounded border border-slate-300 p-2" />
          </label>
          <label className="flex flex-col text-sm">
            RT
            <select
              required
              value={form.rtId}
              onChange={(e) => setForm((a) => ({ ...a, rtId: e.target.value }))}
              className="w-56 rounded border border-slate-300 p-2"
            >
              <option value="" disabled>
                Selecione…
              </option>
              {(rts.dados?.itens ?? []).map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            Turno
            <select value={form.turnoPadrao} onChange={(e) => setForm((a) => ({ ...a, turnoPadrao: e.target.value as 'DIURNO' | 'NOTURNO' }))} className="rounded border border-slate-300 p-2">
              <option value="DIURNO">Diurno</option>
              <option value="NOTURNO">Noturno</option>
            </select>
          </label>
          <label className="flex flex-col text-sm">
            Âncora de escala
            <input type="date" required value={form.escalaAncora} onChange={(e) => setForm((a) => ({ ...a, escalaAncora: e.target.value }))} className="rounded border border-slate-300 p-2" />
          </label>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Criando…' : 'Criar'}
          </Button>
        </form>
        {erro ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erro.mensagem}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Importar em lote (CSV)</h2>
        <p className="mb-1 text-sm text-slate-600">Formato: matricula;nome;rt;turno;ancora — uma linha por colaborador, sem cabeçalho.</p>
        <p className="mb-2 text-xs text-slate-500">
          <code className="rounded bg-slate-100 px-1 py-0.5">rt</code> é o <strong>nome</strong> da RT (ex.: RT1) —
          não o ID. <code className="rounded bg-slate-100 px-1 py-0.5">turno</code> é DIURNO ou NOTURNO.{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">ancora</code> é a data no formato AAAA-MM-DD.
        </p>
        <div className="mb-3">
          <Button type="button" variant="outline" size="sm" onClick={baixarModeloCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Baixar modelo CSV
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(evento) => setArquivo(evento.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <Button variant="outline" onClick={() => void importar(true)} disabled={!arquivo || importando}>
            Pré-visualizar
          </Button>
          <Button onClick={() => void importar(false)} disabled={!arquivo || importando}>
            Importar
          </Button>
        </div>
        {erroImportacao ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erroImportacao}
          </p>
        ) : null}
        {resultadoImportacao ? (
          <div role="status" className="mt-2 text-sm">
            <p>
              {resultadoImportacao.validos} linha(s) válida(s)
              {resultadoImportacao.importados !== undefined ? `; ${resultadoImportacao.importados} importada(s)` : ''}; {resultadoImportacao.erros.length}{' '}
              erro(s).
            </p>
            {resultadoImportacao.erros.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-red-800">
                {resultadoImportacao.erros.slice(0, 10).map((e, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={i}>
                    Linha {e.linha}: {e.problema}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Lista</h2>
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
        ) : !colaboradores.dados || colaboradores.dados.itens.length === 0 ? (
          <EstadoVazio texto="Nenhum colaborador encontrado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="p-2">Nome</th>
                  <th className="p-2">Matrícula</th>
                  <th className="p-2">RT</th>
                  <th className="p-2">Turno</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {colaboradores.dados.itens.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="p-2">
                      <Link href={`/admin/colaboradores/${c.id}`} className="font-medium text-slate-900 underline">
                        {c.nome}
                      </Link>
                    </td>
                    <td className="p-2">{c.matricula}</td>
                    <td className="p-2">{c.rt.nome}</td>
                    <td className="p-2">{c.turnoPadrao === 'DIURNO' ? 'Diurno' : 'Noturno'}</td>
                    <td className="p-2 space-x-1">
                      {!c.ativo ? <Badge variant="outline">Inativo</Badge> : null}
                      {c.bloqueado ? <Badge variant="destructive">Bloqueado</Badge> : null}
                      {!c.pinDefinido ? <Badge variant="secondary">PIN pendente</Badge> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
