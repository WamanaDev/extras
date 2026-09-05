'use client';

import { use, useState } from 'react';
import { ConfirmacaoImpacto } from '@/components/comum/ConfirmacaoImpacto';
import { Button } from '@/components/ui/button';
import { put, post, type ErroApi } from '@/lib/api/client';
import { useListaApi, useRecursoApi } from '@/lib/api/use-recurso';

interface ColaboradorOpcao {
  id: string;
  nome: string;
  matricula: string;
}

interface ImpactoColaborador {
  colaboradorId: string;
  nome: string;
  usadas: number;
  novoLimite: number;
}

/**
 * `/admin/ciclos/:id/participacoes` — FE-001, API-ADM-PAR-001/002.
 *
 * Não existe leitura dedicada de participações (`GET`) no contrato — só
 * `PUT` por colaborador e `POST .../lote` (que aceita `preview: true` e
 * devolve o impacto por colaborador, usado aqui como consulta somente-
 * leitura antes de qualquer gravação). Registrado em `_conflitos.md`.
 */
export default function ParticipacoesCicloPage({ params }: { params: Promise<{ id: string }> }): JSX.Element {
  const { id } = use(params);

  const colaboradores = useListaApi<ColaboradorOpcao>('/api/admin/colaboradores?tamanho=200');
  const rts = useRecursoApi<{ itens: { id: string; nome: string }[] }>('/api/admin/rts');

  // --- individual ------------------------------------------------------------
  const [colaboradorId, setColaboradorId] = useState('');
  const [limiteOverride, setLimiteOverride] = useState('');
  const [permiteCruzada, setPermiteCruzada] = useState<'HERDAR' | 'SIM' | 'NAO'>('HERDAR');
  const [bloqueado, setBloqueado] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviandoIndividual, setEnviandoIndividual] = useState(false);
  const [erroIndividual, setErroIndividual] = useState<ErroApi | null>(null);
  const [impactoIndividual, setImpactoIndividual] = useState<string[] | null>(null);
  const [sucessoIndividual, setSucessoIndividual] = useState<string | null>(null);

  async function salvarIndividual(confirmarImpacto: boolean): Promise<void> {
    setEnviandoIndividual(true);
    setErroIndividual(null);
    const body: Record<string, unknown> = { confirmarImpacto, bloqueado };
    if (limiteOverride.trim() !== '') body.limiteOverride = Number(limiteOverride);
    if (permiteCruzada !== 'HERDAR') body.permiteCruzada = permiteCruzada === 'SIM';
    if (motivo.trim() !== '') body.motivo = motivo;
    const resultado = await put<{ bloqueado: boolean }>(`/api/admin/ciclos/${id}/participacoes/${colaboradorId}`, body);
    setEnviandoIndividual(false);
    if (resultado.ok) {
      setImpactoIndividual(null);
      setSucessoIndividual('Participação atualizada.');
      return;
    }
    if (resultado.erro.erro === 'IMPACTO_NAO_CONFIRMADO') {
      setImpactoIndividual([resultado.erro.mensagem]);
      return;
    }
    setErroIndividual(resultado.erro);
  }

  // --- lote --------------------------------------------------------------------
  const [rtId, setRtId] = useState('');
  const [turno, setTurno] = useState<'' | 'DIURNO' | 'NOTURNO'>('');
  const [limiteOverrideLote, setLimiteOverrideLote] = useState('');
  const [permiteCruzadaLote, setPermiteCruzadaLote] = useState<'HERDAR' | 'SIM' | 'NAO'>('HERDAR');
  const [motivoLote, setMotivoLote] = useState('');
  const [enviandoLote, setEnviandoLote] = useState(false);
  const [erroLote, setErroLote] = useState<ErroApi | null>(null);
  const [previewLote, setPreviewLote] = useState<ImpactoColaborador[] | null>(null);
  const [impactoLote, setImpactoLote] = useState<string[] | null>(null);
  const [sucessoLote, setSucessoLote] = useState<string | null>(null);

  function montarCorpoLote(preview: boolean, confirmarImpacto: boolean): Record<string, unknown> {
    const filtro: Record<string, unknown> = {};
    if (rtId.trim() !== '') filtro.rtId = rtId.trim();
    if (turno !== '') filtro.turno = turno;
    const body: Record<string, unknown> = { filtro, motivo: motivoLote || 'Consulta de participações', preview, confirmarImpacto };
    if (limiteOverrideLote.trim() !== '') body.limiteOverride = Number(limiteOverrideLote);
    if (permiteCruzadaLote !== 'HERDAR') body.permiteCruzada = permiteCruzadaLote === 'SIM';
    return body;
  }

  async function consultarLote(): Promise<void> {
    setEnviandoLote(true);
    setErroLote(null);
    const resultado = await post<{ afetados: number; impacto: ImpactoColaborador[] }>(
      `/api/admin/ciclos/${id}/participacoes/lote`,
      montarCorpoLote(true, false),
    );
    setEnviandoLote(false);
    if (resultado.ok) {
      setPreviewLote(resultado.dados.impacto);
    } else {
      setErroLote(resultado.erro);
    }
  }

  async function aplicarLote(confirmarImpacto: boolean): Promise<void> {
    setEnviandoLote(true);
    setErroLote(null);
    const resultado = await post<{ afetados: number }>(`/api/admin/ciclos/${id}/participacoes/lote`, montarCorpoLote(false, confirmarImpacto));
    setEnviandoLote(false);
    if (resultado.ok) {
      setImpactoLote(null);
      setSucessoLote(`${resultado.dados.afetados} colaborador(es) afetado(s).`);
      setPreviewLote(null);
      return;
    }
    if (resultado.erro.erro === 'IMPACTO_NAO_CONFIRMADO') {
      setImpactoLote([resultado.erro.mensagem]);
      return;
    }
    setErroLote(resultado.erro);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Participações do ciclo</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Definir participação individual</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            Colaborador
            <select
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
            Limite (vazio = herdar do ciclo)
            <input
              type="number"
              min={0}
              value={limiteOverride}
              onChange={(evento) => setLimiteOverride(evento.target.value)}
              className="w-40 rounded border border-slate-300 p-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            Cruzada
            <select value={permiteCruzada} onChange={(evento) => setPermiteCruzada(evento.target.value as typeof permiteCruzada)} className="rounded border border-slate-300 p-2">
              <option value="HERDAR">Herdar do ciclo</option>
              <option value="SIM">Permitir</option>
              <option value="NAO">Bloquear</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={bloqueado} onChange={(evento) => setBloqueado(evento.target.checked)} />
            Bloquear participação
          </label>
          <label className="flex flex-1 flex-col text-sm">
            Motivo
            <input type="text" value={motivo} onChange={(evento) => setMotivo(evento.target.value)} className="rounded border border-slate-300 p-2" />
          </label>
          <Button onClick={() => void salvarIndividual(false)} disabled={enviandoIndividual || colaboradorId.trim() === ''}>
            Salvar
          </Button>
        </div>
        {erroIndividual ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erroIndividual.mensagem}
          </p>
        ) : null}
        {sucessoIndividual ? (
          <p role="status" className="mt-2 text-sm text-emerald-800">
            {sucessoIndividual}
          </p>
        ) : null}
        <ConfirmacaoImpacto
          aberto={impactoIndividual !== null}
          itens={impactoIndividual ?? []}
          carregando={enviandoIndividual}
          onCancelar={() => setImpactoIndividual(null)}
          onConfirmar={() => void salvarIndividual(true)}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Aplicar em lote (por RT ou turno)</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            RT
            <select value={rtId} onChange={(evento) => setRtId(evento.target.value)} className="w-56 rounded border border-slate-300 p-2">
              <option value="">Todas</option>
              {(rts.dados?.itens ?? []).map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            Turno
            <select value={turno} onChange={(evento) => setTurno(evento.target.value as typeof turno)} className="rounded border border-slate-300 p-2">
              <option value="">(qualquer)</option>
              <option value="DIURNO">Diurno</option>
              <option value="NOTURNO">Noturno</option>
            </select>
          </label>
          <label className="flex flex-col text-sm">
            Limite (vazio = herdar)
            <input
              type="number"
              min={0}
              value={limiteOverrideLote}
              onChange={(evento) => setLimiteOverrideLote(evento.target.value)}
              className="w-40 rounded border border-slate-300 p-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            Cruzada
            <select value={permiteCruzadaLote} onChange={(evento) => setPermiteCruzadaLote(evento.target.value as typeof permiteCruzadaLote)} className="rounded border border-slate-300 p-2">
              <option value="HERDAR">Herdar do ciclo</option>
              <option value="SIM">Permitir</option>
              <option value="NAO">Bloquear</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col text-sm">
            Motivo (obrigatório para gravar)
            <input type="text" value={motivoLote} onChange={(evento) => setMotivoLote(evento.target.value)} className="rounded border border-slate-300 p-2" />
          </label>
          <Button variant="outline" onClick={() => void consultarLote()} disabled={enviandoLote || (rtId.trim() === '' && turno === '')}>
            Consultar
          </Button>
          <Button
            onClick={() => void aplicarLote(false)}
            disabled={enviandoLote || (rtId.trim() === '' && turno === '') || motivoLote.trim() === ''}
          >
            Aplicar
          </Button>
        </div>
        {erroLote ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erroLote.mensagem}
          </p>
        ) : null}
        {sucessoLote ? (
          <p role="status" className="mt-2 text-sm text-emerald-800">
            {sucessoLote}
          </p>
        ) : null}
        {previewLote ? (
          <div role="status" className="mt-3 overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="p-2">Colaborador</th>
                  <th className="p-2">Usadas</th>
                  <th className="p-2">Novo limite</th>
                </tr>
              </thead>
              <tbody>
                {previewLote.map((linha) => (
                  <tr key={linha.colaboradorId} className="border-b border-slate-100">
                    <td className="p-2">{linha.nome}</td>
                    <td className="p-2">{linha.usadas}</td>
                    <td className="p-2">{linha.novoLimite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <ConfirmacaoImpacto
          aberto={impactoLote !== null}
          itens={impactoLote ?? []}
          carregando={enviandoLote}
          onCancelar={() => setImpactoLote(null)}
          onConfirmar={() => void aplicarLote(true)}
        />
      </section>
    </div>
  );
}
