'use client';

import { use, useState } from 'react';
import { useListaApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmacaoImpacto } from '@/components/comum/ConfirmacaoImpacto';
import { EditorEscalaColaborador } from '@/components/colaboradores/EditorEscalaColaborador';
import { patch, post, type ErroApi } from '@/lib/api/client';

interface ColaboradorListado {
  id: string;
  nome: string;
  matricula: string;
  rt: { id: string; nome: string };
  turnoPadrao: string;
  ativo: boolean;
  pinDefinido: boolean;
  bloqueado: boolean;
  sessoesAtivas: number;
}

/**
 * `/admin/colaboradores/:id` — FE-001, API-ADM-COL-003/006..010.
 *
 * Não existe `GET /api/admin/colaboradores/:id` — os dados de cabeçalho vêm
 * da listagem (`API-ADM-COL-001`) filtrada pelo id, mesmo padrão já usado em
 * `/admin/ciclos/:id`. `<EditorEscalaColaborador />` (pronto) cobre a troca
 * de escala (`API-ADM-COL-006`).
 */
export default function ColaboradorDetalhePage({ params }: { params: Promise<{ id: string }> }): JSX.Element {
  const { id } = use(params);
  const colaboradores = useListaApi<ColaboradorListado>('/api/admin/colaboradores?tamanho=200');
  const colaborador = colaboradores.dados?.itens.find((c) => c.id === id) ?? null;

  const [ativo, setAtivo] = useState<boolean | null>(null);
  const [erroDados, setErroDados] = useState<ErroApi | null>(null);
  const [impactoDados, setImpactoDados] = useState<string[] | null>(null);
  const [salvandoDados, setSalvandoDados] = useState(false);

  const [motivoReset, setMotivoReset] = useState('');
  const [enviandoReset, setEnviandoReset] = useState(false);
  const [resultadoReset, setResultadoReset] = useState<string | null>(null);
  const [erroReset, setErroReset] = useState<ErroApi | null>(null);

  const [motivoRevogar, setMotivoRevogar] = useState('');
  const [enviandoRevogar, setEnviandoRevogar] = useState(false);
  const [resultadoRevogar, setResultadoRevogar] = useState<string | null>(null);
  const [erroRevogar, setErroRevogar] = useState<ErroApi | null>(null);

  const [enviandoDesbloqueio, setEnviandoDesbloqueio] = useState(false);
  const [resultadoDesbloqueio, setResultadoDesbloqueio] = useState<string | null>(null);
  const [erroDesbloqueio, setErroDesbloqueio] = useState<ErroApi | null>(null);

  async function salvarAtivo(confirmarImpacto: boolean): Promise<void> {
    if (ativo === null) return;
    setSalvandoDados(true);
    setErroDados(null);
    const resultado = await patch<{ impacto?: unknown }>(`/api/admin/colaboradores/${id}`, { ativo, confirmarImpacto });
    setSalvandoDados(false);
    if (resultado.ok) {
      setImpactoDados(null);
      colaboradores.recarregar();
      return;
    }
    if (resultado.erro.erro === 'IMPACTO_NAO_CONFIRMADO') {
      setImpactoDados([resultado.erro.mensagem]);
      return;
    }
    setErroDados(resultado.erro);
  }

  async function resetarPin(): Promise<void> {
    setEnviandoReset(true);
    setErroReset(null);
    const resultado = await post<{ sessoesRevogadas: number }>(`/api/admin/colaboradores/${id}/resetar-pin`, { motivo: motivoReset });
    setEnviandoReset(false);
    if (resultado.ok) {
      setResultadoReset(`PIN resetado. ${resultado.dados.sessoesRevogadas} sessão(ões) revogada(s).`);
      colaboradores.recarregar();
    } else {
      setErroReset(resultado.erro);
    }
  }

  async function revogarSessoes(): Promise<void> {
    setEnviandoRevogar(true);
    setErroRevogar(null);
    const resultado = await post<{ revogadas: number }>(`/api/admin/colaboradores/${id}/revogar-sessoes`, { motivo: motivoRevogar });
    setEnviandoRevogar(false);
    if (resultado.ok) {
      setResultadoRevogar(`${resultado.dados.revogadas} sessão(ões) revogada(s).`);
      colaboradores.recarregar();
    } else {
      setErroRevogar(resultado.erro);
    }
  }

  async function desbloquear(): Promise<void> {
    setEnviandoDesbloqueio(true);
    setErroDesbloqueio(null);
    const resultado = await post<{ bloqueado: boolean }>(`/api/admin/colaboradores/${id}/desbloquear`);
    setEnviandoDesbloqueio(false);
    if (resultado.ok) {
      setResultadoDesbloqueio('Conta desbloqueada.');
      colaboradores.recarregar();
    } else {
      setErroDesbloqueio(resultado.erro);
    }
  }

  if (colaboradores.carregando) return <EstadoCarregando texto="Carregando colaborador…" />;
  if (colaboradores.erro) return <EstadoErro mensagem={colaboradores.erro} />;
  if (!colaborador) return <EstadoVazio texto="Colaborador não encontrado." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">
          {colaborador.nome} <span className="text-slate-400">#{colaborador.matricula}</span>
        </h1>
        <div className="space-x-1">
          {!colaborador.ativo ? <Badge variant="outline">Inativo</Badge> : <Badge variant="success">Ativo</Badge>}
          {colaborador.bloqueado ? <Badge variant="destructive">Bloqueado</Badge> : null}
        </div>
      </div>
      <p className="text-sm text-slate-600">
        {colaborador.rt.nome} · {colaborador.turnoPadrao === 'DIURNO' ? 'Diurno' : 'Noturno'} · {colaborador.sessoesAtivas} sessão(ões) ativa(s)
      </p>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Situação</h2>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" defaultChecked={colaborador.ativo} onChange={(evento) => setAtivo(evento.target.checked)} />
            Ativo
          </label>
          <Button onClick={() => void salvarAtivo(false)} disabled={salvandoDados || ativo === null}>
            Salvar
          </Button>
        </div>
        {erroDados ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erroDados.mensagem}
          </p>
        ) : null}
        <ConfirmacaoImpacto
          aberto={impactoDados !== null}
          itens={impactoDados ?? []}
          carregando={salvandoDados}
          onCancelar={() => setImpactoDados(null)}
          onConfirmar={() => void salvarAtivo(true)}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Trocar escala</h2>
        <EditorEscalaColaborador colaboradorId={id} />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Resetar PIN</h2>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Motivo"
              value={motivoReset}
              onChange={(evento) => setMotivoReset(evento.target.value)}
              className="rounded border border-slate-300 p-2 text-sm"
            />
            <Button variant="destructive" onClick={() => void resetarPin()} disabled={enviandoReset || !motivoReset}>
              Resetar PIN
            </Button>
          </div>
          {erroReset ? (
            <p role="alert" className="mt-2 text-sm text-red-800">
              {erroReset.mensagem}
            </p>
          ) : null}
          {resultadoReset ? (
            <p role="status" className="mt-2 text-sm text-emerald-800">
              {resultadoReset}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Revogar sessões</h2>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Motivo"
              value={motivoRevogar}
              onChange={(evento) => setMotivoRevogar(evento.target.value)}
              className="rounded border border-slate-300 p-2 text-sm"
            />
            <Button variant="destructive" onClick={() => void revogarSessoes()} disabled={enviandoRevogar || !motivoRevogar}>
              Revogar todas as sessões
            </Button>
          </div>
          {erroRevogar ? (
            <p role="alert" className="mt-2 text-sm text-red-800">
              {erroRevogar.mensagem}
            </p>
          ) : null}
          {resultadoRevogar ? (
            <p role="status" className="mt-2 text-sm text-emerald-800">
              {resultadoRevogar}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Desbloquear conta</h2>
          <Button variant="outline" onClick={() => void desbloquear()} disabled={enviandoDesbloqueio || !colaborador.bloqueado}>
            Desbloquear
          </Button>
          {!colaborador.bloqueado ? <p className="mt-2 text-sm text-slate-500">Esta conta não está bloqueada.</p> : null}
          {erroDesbloqueio ? (
            <p role="alert" className="mt-2 text-sm text-red-800">
              {erroDesbloqueio.mensagem}
            </p>
          ) : null}
          {resultadoDesbloqueio ? (
            <p role="status" className="mt-2 text-sm text-emerald-800">
              {resultadoDesbloqueio}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Exportar dados (LGPD)</h2>
          <div className="flex gap-2">
            <a href={`/api/admin/colaboradores/${id}/exportar-dados?formato=json`}>
              <Button variant="outline">Baixar JSON</Button>
            </a>
            <a href={`/api/admin/colaboradores/${id}/exportar-dados?formato=pdf`}>
              <Button variant="outline">Baixar PDF</Button>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
