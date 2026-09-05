'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { GradeEscala } from '@/components/escala/GradeEscala';
import { ConfirmacaoImpacto } from '@/components/comum/ConfirmacaoImpacto';
import { Button } from '@/components/ui/button';
import { post, type ErroApi } from '@/lib/api/client';
import { useListaApi, useRecursoApi } from '@/lib/api/use-recurso';

interface ColaboradorOpcao {
  id: string;
  nome: string;
  matricula: string;
}

/**
 * `/admin/ciclos/:id/escala` — FE-001, API-ADM-ESC-001/002/003.
 *
 * A grade em si é `<GradeEscala />` (já pronta) — esta página só acrescenta
 * o lançamento de ausência em lote (`API-ADM-ESC-003`) e o link para
 * impressão. Colaborador e código vêm de `/api/admin/colaboradores` e
 * `/api/admin/codigos-escala` (rotas de referência — ver `_conflitos.md`).
 */
export default function EscalaCicloPage({ params }: { params: Promise<{ id: string }> }): JSX.Element {
  const { id } = use(params);
  const colaboradores = useListaApi<ColaboradorOpcao>('/api/admin/colaboradores?tamanho=200');
  const codigos = useRecursoApi<{ itens: { id: string; codigo: string; descricao: string }[] }>('/api/admin/codigos-escala');
  const [colaboradorId, setColaboradorId] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [codigo, setCodigo] = useState('F');
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [impacto, setImpacto] = useState<string[] | null>(null);
  const [resultado, setResultado] = useState<{ alterados: number; ignorados: number } | null>(null);
  const [recarregarChave, setRecarregarChave] = useState(0);

  async function lancarLote(confirmarImpacto: boolean): Promise<void> {
    setEnviando(true);
    setErro(null);
    const resultadoChamada = await post<{ alterados: number; ignorados: number; impacto: { extrasAfetadas: unknown[]; diasComDeficit: unknown[] } }>(
      '/api/admin/escala/lote',
      { colaboradorId, de, ate, codigo, observacao: observacao || undefined, confirmarImpacto },
    );
    setEnviando(false);
    if (resultadoChamada.ok) {
      setImpacto(null);
      setResultado({ alterados: resultadoChamada.dados.alterados, ignorados: resultadoChamada.dados.ignorados });
      setRecarregarChave((v) => v + 1);
      return;
    }
    if (resultadoChamada.erro.erro === 'IMPACTO_NAO_CONFIRMADO') {
      setImpacto(['Esta alteração afeta extras já marcadas ou a cobertura mínima no intervalo informado.']);
      return;
    }
    setErro(resultadoChamada.erro);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Escala do ciclo</h1>
        <Link href={`/admin/ciclos/${id}/escala/imprimir`} className="text-sm font-medium text-slate-900 underline">
          Imprimir (A4 paisagem)
        </Link>
      </div>

      <GradeEscala key={recarregarChave} cicloId={id} />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Lançar ausência em lote</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            void lancarLote(false);
          }}
        >
          <label className="flex flex-col text-sm">
            Colaborador
            <select
              required
              value={colaboradorId}
              onChange={(evento) => setColaboradorId(evento.target.value)}
              className="w-64 rounded border border-slate-300 p-2"
            >
              <option value="" disabled>
                Selecione…
              </option>
              {(colaboradores.dados?.itens ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.matricula})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            De
            <input type="date" required value={de} onChange={(evento) => setDe(evento.target.value)} className="rounded border border-slate-300 p-2" />
          </label>
          <label className="flex flex-col text-sm">
            Até
            <input type="date" required value={ate} onChange={(evento) => setAte(evento.target.value)} className="rounded border border-slate-300 p-2" />
          </label>
          <label className="flex flex-col text-sm">
            Código
            <select required value={codigo} onChange={(evento) => setCodigo(evento.target.value)} className="w-24 rounded border border-slate-300 p-2">
              {(codigos.dados?.itens ?? []).map((c) => (
                <option key={c.id} value={c.codigo}>
                  {c.codigo} — {c.descricao}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col text-sm">
            Observação
            <input
              type="text"
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
              className="rounded border border-slate-300 p-2"
            />
          </label>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Lançando…' : 'Lançar em lote'}
          </Button>
        </form>
        {erro ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erro.mensagem}
          </p>
        ) : null}
        {resultado ? (
          <p role="status" className="mt-2 text-sm text-emerald-800">
            {resultado.alterados} dia(s) alterado(s); {resultado.ignorados} ignorado(s) (sem escala ou ciclo fechado).
          </p>
        ) : null}
        <ConfirmacaoImpacto
          aberto={impacto !== null}
          titulo="Esta alteração em lote afeta extras ou a cobertura mínima"
          itens={impacto ?? []}
          carregando={enviando}
          onCancelar={() => setImpacto(null)}
          onConfirmar={() => void lancarLote(true)}
        />
      </section>
    </div>
  );
}
