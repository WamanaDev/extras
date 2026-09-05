'use client';

import { use, useMemo, useState } from 'react';
import { useListaApi, useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { post, del, type ErroApi } from '@/lib/api/client';

interface PlantaoOpcao {
  id: string;
  data: string;
  tipo: string;
  rtId: string;
  rtNome: string;
  vagasTotais: number;
  vagasOcupadas: number;
}

interface ColaboradorOpcao {
  id: string;
  nome: string;
  matricula: string;
}

interface MarcacaoListada {
  id: string;
  colaborador: { id: string; nome: string; matricula: string; rt: string };
  plantao: { id: string; data: string; tipo: string; rt: string; horaInicio: string; horaFim: string };
  status: string;
  cruzada: boolean;
  origem: string;
  criadoEm: string;
  canceladoEm: string | null;
}

interface RespostaMarcacoes {
  marcacoes: MarcacaoListada[];
  totais: { confirmadas: number; canceladas: number; horas: number; cruzadas: number };
}

/** `/admin/ciclos/:id/marcacoes` — FE-001, API-ADM-MAR-001..003. */
export default function MarcacoesCicloPage({ params }: { params: Promise<{ id: string }> }): JSX.Element {
  const { id } = use(params);
  const marcacoes = useRecursoApi<RespostaMarcacoes>(`/api/admin/marcacoes?cicloId=${encodeURIComponent(id)}&tamanho=200`);
  const plantoes = useRecursoApi<{ itens: PlantaoOpcao[] }>(`/api/admin/ciclos/${encodeURIComponent(id)}/plantoes`);
  const colaboradores = useListaApi<ColaboradorOpcao>('/api/admin/colaboradores?tamanho=200');

  // Trocado de "um select com todo plantão" (linha única data+turno+RT+vagas,
  // difícil de escanear) para data + turno separados — mais intuitivo
  // (pedido do usuário). Quando há mais de uma RT no mesmo dia/turno, um
  // terceiro select de RT aparece só nesse caso, pra desambiguar.
  const [data, setData] = useState('');
  const [turno, setTurno] = useState<'DIURNO' | 'NOTURNO' | ''>('');
  const [rtId, setRtId] = useState('');
  const [colaboradorId, setColaboradorId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);

  const plantoesDoDiaTurno = useMemo(
    () => (plantoes.dados?.itens ?? []).filter((p) => p.data === data && p.tipo === turno),
    [plantoes.dados, data, turno],
  );
  const rtsDisponiveis = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of plantoesDoDiaTurno) mapa.set(p.rtId, p.rtNome);
    return [...mapa.entries()].map(([rid, nome]) => ({ id: rid, nome }));
  }, [plantoesDoDiaTurno]);
  const plantaoId =
    rtsDisponiveis.length <= 1
      ? (plantoesDoDiaTurno[0]?.id ?? '')
      : (plantoesDoDiaTurno.find((p) => p.rtId === rtId)?.id ?? '');

  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [erroCancelamento, setErroCancelamento] = useState<ErroApi | null>(null);

  async function marcar(): Promise<void> {
    setEnviando(true);
    setErro(null);
    const resultado = await post<{ id: string }>('/api/admin/marcacoes', { plantaoId, colaboradorId, motivo });
    setEnviando(false);
    if (resultado.ok) {
      setData('');
      setTurno('');
      setRtId('');
      setColaboradorId('');
      setMotivo('');
      marcacoes.recarregar();
    } else {
      setErro(resultado.erro);
    }
  }

  async function cancelar(marcacaoId: string): Promise<void> {
    setEnviando(true);
    setErroCancelamento(null);
    const resultado = await del<{ id: string }>(`/api/admin/marcacoes/${marcacaoId}`, {
      body: JSON.stringify({ motivo: motivoCancelamento }),
    });
    setEnviando(false);
    if (resultado.ok) {
      setCancelandoId(null);
      setMotivoCancelamento('');
      marcacoes.recarregar();
    } else {
      setErroCancelamento(resultado.erro);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Marcações do ciclo</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Marcar extra manualmente</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            Dia
            <input
              type="date"
              value={data}
              onChange={(evento) => {
                setData(evento.target.value);
                setRtId('');
              }}
              className="rounded border border-slate-300 p-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            Turno
            <select
              value={turno}
              onChange={(evento) => {
                setTurno(evento.target.value as typeof turno);
                setRtId('');
              }}
              className="w-32 rounded border border-slate-300 p-2"
            >
              <option value="" disabled>
                Selecione…
              </option>
              <option value="DIURNO">Diurno</option>
              <option value="NOTURNO">Noturno</option>
            </select>
          </label>
          {rtsDisponiveis.length > 1 ? (
            <label className="flex flex-col text-sm">
              RT
              <select value={rtId} onChange={(evento) => setRtId(evento.target.value)} className="w-48 rounded border border-slate-300 p-2">
                <option value="" disabled>
                  Selecione…
                </option>
                {rtsDisponiveis.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.nome}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {data && turno && plantoesDoDiaTurno.length === 0 ? (
            <p className="text-sm text-amber-700">Nenhum plantão cadastrado para este dia/turno.</p>
          ) : null}
          {plantaoId ? (
            (() => {
              const p = plantoesDoDiaTurno.find((pl) => pl.id === plantaoId);
              return p ? (
                <p className="text-sm text-slate-500">
                  {p.rtNome} — {p.vagasOcupadas}/{p.vagasTotais} vaga(s) ocupada(s)
                </p>
              ) : null;
            })()
          ) : null}
          <label className="flex flex-col text-sm">
            Colaborador
            <select value={colaboradorId} onChange={(evento) => setColaboradorId(evento.target.value)} className="w-64 rounded border border-slate-300 p-2">
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
          <label className="flex flex-1 flex-col text-sm">
            Motivo
            <input type="text" value={motivo} onChange={(evento) => setMotivo(evento.target.value)} className="rounded border border-slate-300 p-2" />
          </label>
          <Button onClick={() => void marcar()} disabled={enviando || !plantaoId || !colaboradorId || !motivo}>
            Marcar
          </Button>
        </div>
        {erro ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erro.mensagem}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Conferência</h2>
        {marcacoes.carregando ? (
          <EstadoCarregando />
        ) : marcacoes.erro ? (
          <EstadoErro mensagem={marcacoes.erro} />
        ) : !marcacoes.dados || marcacoes.dados.marcacoes.length === 0 ? (
          <EstadoVazio texto="Nenhuma marcação neste ciclo." />
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-600">
              {marcacoes.dados.totais.confirmadas} confirmada(s) · {marcacoes.dados.totais.canceladas} cancelada(s) ·{' '}
              {marcacoes.dados.totais.cruzadas} cruzada(s) · {marcacoes.dados.totais.horas}h
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="p-2">Colaborador</th>
                    <th className="p-2">Plantão</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Cruzada</th>
                    <th className="p-2">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {marcacoes.dados.marcacoes.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100 align-top">
                      <td className="p-2">
                        {m.colaborador.nome} <span className="text-slate-400">#{m.colaborador.matricula}</span>
                      </td>
                      <td className="p-2">
                        {m.plantao.data} · {m.plantao.tipo === 'DIURNO' ? 'Diurno' : 'Noturno'} · {m.plantao.rt} · {m.plantao.horaInicio}–
                        {m.plantao.horaFim}
                      </td>
                      <td className="p-2">
                        <Badge variant={m.status === 'CONFIRMADA' ? 'success' : 'outline'}>{m.status}</Badge>
                      </td>
                      <td className="p-2">{m.cruzada ? 'Sim' : 'Não'}</td>
                      <td className="p-2">
                        {m.status === 'CONFIRMADA' ? (
                          cancelandoId === m.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Motivo"
                                value={motivoCancelamento}
                                onChange={(evento) => setMotivoCancelamento(evento.target.value)}
                                className="w-40 rounded border border-slate-300 p-1"
                              />
                              <Button size="sm" variant="destructive" onClick={() => void cancelar(m.id)} disabled={enviando || !motivoCancelamento}>
                                Confirmar
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setCancelandoId(null)} disabled={enviando}>
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setCancelandoId(m.id)}>
                              Cancelar extra
                            </Button>
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {cancelandoId === m.id && erroCancelamento ? (
                          <p role="alert" className="mt-1 text-red-800">
                            {erroCancelamento.mensagem}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
