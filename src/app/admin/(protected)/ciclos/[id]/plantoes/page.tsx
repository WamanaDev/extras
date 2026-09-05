'use client';

import { use, useMemo, useState } from 'react';
import { useListaApi, useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro } from '@/components/admin/Estado';
import { GeradorLote, type RtOpcao } from '@/components/plantoes/GeradorLote';
import { ConfirmacaoImpacto } from '@/components/comum/ConfirmacaoImpacto';
import { Button } from '@/components/ui/button';
import { patch, del, type ErroApi } from '@/lib/api/client';

interface ColaboradorListado {
  rt: { id: string; nome: string };
}

interface PlantaoOpcao {
  id: string;
  data: string;
  tipo: string;
  rtNome: string;
  vagasTotais: number;
  vagasOcupadas: number;
}

/**
 * `/admin/ciclos/:id/plantoes` — FE-001, API-ADM-PLA-001..004.
 *
 * `<GeradorLote />` cobre a criação em lote (`API-ADM-PLA-002`) — já pronto,
 * só precisa da lista de RTs. O contrato de `04-api/admin-plantoes/` só
 * define `POST` (criar) e `PATCH`/`DELETE` por id — a listagem usada aqui
 * para editar/remover vem de `GET /api/admin/ciclos/:id/plantoes`, rota de
 * referência sem ID de spec própria (mesma família de `/api/admin/rts`/
 * `codigos-escala` — ver `_conflitos.md`).
 */
export default function PlantoesCicloPage({ params }: { params: Promise<{ id: string }> }): JSX.Element {
  const { id } = use(params);
  const colaboradores = useListaApi<ColaboradorListado>('/api/admin/colaboradores?tamanho=200');
  const plantoes = useRecursoApi<{ itens: PlantaoOpcao[] }>(`/api/admin/ciclos/${encodeURIComponent(id)}/plantoes`);

  const rts = useMemo<RtOpcao[]>(() => {
    const mapa = new Map<string, string>();
    for (const c of colaboradores.dados?.itens ?? []) mapa.set(c.rt.id, c.rt.nome);
    return [...mapa.entries()].map(([id_, nome]) => ({ id: id_, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [colaboradores.dados]);

  const [plantaoId, setPlantaoId] = useState('');
  const [vagasTotais, setVagasTotais] = useState('');
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [impacto, setImpacto] = useState<string[] | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function atualizar(confirmarImpacto: boolean): Promise<void> {
    setEnviando(true);
    setErro(null);
    const body: Record<string, unknown> = { confirmarImpacto };
    if (vagasTotais.trim() !== '') body.vagasTotais = Number(vagasTotais);
    if (observacao.trim() !== '') body.observacao = observacao;
    const resultado = await patch<unknown>(`/api/admin/plantoes/${plantaoId}`, body);
    setEnviando(false);
    if (resultado.ok) {
      setImpacto(null);
      setSucesso('Plantão atualizado.');
      plantoes.recarregar();
      return;
    }
    if (resultado.erro.erro === 'IMPACTO_NAO_CONFIRMADO') {
      setImpacto(Object.values(resultado.erro.detalhes ?? { info: resultado.erro.mensagem }));
      return;
    }
    setErro(resultado.erro);
  }

  async function remover(): Promise<void> {
    setEnviando(true);
    setErro(null);
    const resultado = await del<{ marcacoesCanceladas: number }>(`/api/admin/plantoes/${plantaoId}`, {
      body: JSON.stringify({ confirmarCancelamentos: true, motivo: 'Removido pelo admin' }),
    });
    setEnviando(false);
    if (resultado.ok) {
      setSucesso(`Plantão removido. ${resultado.dados.marcacoesCanceladas} marcação(ões) cancelada(s).`);
      setPlantaoId('');
      plantoes.recarregar();
    } else {
      setErro(resultado.erro);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Plantões do ciclo</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Criar plantões em lote</h2>
        {colaboradores.carregando ? (
          <EstadoCarregando texto="Carregando RTs…" />
        ) : colaboradores.erro ? (
          <EstadoErro mensagem={colaboradores.erro} />
        ) : (
          <GeradorLote cicloId={id} rts={rts} />
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Editar ou remover um plantão existente</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            Plantão
            <select
              value={plantaoId}
              onChange={(evento) => setPlantaoId(evento.target.value)}
              className="w-72 rounded border border-slate-300 p-2"
            >
              <option value="" disabled>
                Selecione…
              </option>
              {(plantoes.dados?.itens ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.data} · {p.tipo === 'DIURNO' ? 'Diurno' : 'Noturno'} · {p.rtNome} ({p.vagasOcupadas}/{p.vagasTotais})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            Novas vagas totais
            <input
              type="number"
              min={1}
              value={vagasTotais}
              onChange={(evento) => setVagasTotais(evento.target.value)}
              className="w-32 rounded border border-slate-300 p-2"
            />
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
          <Button onClick={() => void atualizar(false)} disabled={enviando || plantaoId.trim() === ''}>
            Salvar
          </Button>
          <Button variant="destructive" onClick={() => void remover()} disabled={enviando || plantaoId.trim() === ''}>
            Remover
          </Button>
        </div>
        {erro ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erro.mensagem}
          </p>
        ) : null}
        {sucesso ? (
          <p role="status" className="mt-2 text-sm text-emerald-800">
            {sucesso}
          </p>
        ) : null}
        <ConfirmacaoImpacto
          aberto={impacto !== null}
          titulo="Esta alteração afeta marcações confirmadas"
          itens={impacto ?? []}
          carregando={enviando}
          onCancelar={() => setImpacto(null)}
          onConfirmar={() => void atualizar(true)}
        />
      </section>
    </div>
  );
}
