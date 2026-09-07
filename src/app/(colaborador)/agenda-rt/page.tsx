'use client';

/**
 * `/(colaborador)/agenda-rt` — API-AGE-001/002/003/004/005. Calendário
 * (aqui, lista por período) de consultas e saídas da própria RT — nunca há
 * seletor de RT (FE-003.1, RNP-01).
 */
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { post, patch, type ErroApi } from '@/lib/api/client';
import { useAgendaPacientesRealtime } from '@/hooks/useAgendaPacientesRealtime';

interface Agendamento {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  tipo: 'CONSULTA' | 'SAIDA';
  titulo: string;
  local: string | null;
  inicioEm: string;
  fimEm: string;
  status: 'AGENDADO' | 'CONFIRMADO' | 'REALIZADO' | 'CANCELADO' | 'NAO_COMPARECEU';
  acompanhanteNome: string | null;
}

interface PacienteItem {
  id: string;
  nome: string;
}

function inicioDoMes(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}
function fimDoMes(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0)).toISOString().slice(0, 10);
}

function variantePorStatus(status: Agendamento['status']): 'default' | 'secondary' | 'warning' | 'destructive' | 'success' {
  switch (status) {
    case 'REALIZADO':
      return 'success';
    case 'CANCELADO':
      return 'secondary';
    case 'NAO_COMPARECEU':
      return 'destructive';
    case 'CONFIRMADO':
      return 'default';
    default:
      return 'warning';
  }
}

const ROTULO_STATUS: Record<Agendamento['status'], string> = {
  AGENDADO: 'Agendado',
  CONFIRMADO: 'Confirmado',
  REALIZADO: 'Realizado',
  CANCELADO: 'Cancelado',
  NAO_COMPARECEU: 'Não compareceu',
};

const FORM_VAZIO = {
  pacienteId: '',
  tipo: 'CONSULTA' as 'CONSULTA' | 'SAIDA',
  titulo: '',
  local: '',
  data: new Date().toISOString().slice(0, 10),
  horaInicio: '09:00',
  horaFim: '10:00',
  observacoes: '',
};

function offsetLocal(): string {
  const min = -new Date().getTimezoneOffset();
  const sinal = min >= 0 ? '+' : '-';
  const abs = Math.abs(min);
  return `${sinal}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export default function AgendaRtPage(): JSX.Element {
  const searchParams = useSearchParams();
  const [de] = useState(inicioDoMes());
  const [ate] = useState(fimDoMes());

  const agenda = useRecursoApi<Agendamento[]>(`/api/agendamentos?de=${de}&ate=${ate}`);
  const pacientes = useRecursoApi<{ itens: PacienteItem[] }>('/api/pacientes');
  const rtInfo = useRecursoApi<{ rtId: string }>('/api/colaborador/rt');
  useAgendaPacientesRealtime(rtInfo.dados?.rtId, () => agenda.recarregar());

  const [novoAberto, setNovoAberto] = useState(false);
  const [form, setForm] = useState({ ...FORM_VAZIO, pacienteId: searchParams.get('pacienteId') ?? '' });
  const [enviandoNovo, setEnviandoNovo] = useState(false);
  const [erroNovo, setErroNovo] = useState<ErroApi | null>(null);

  const [paraCancelar, setParaCancelar] = useState<Agendamento | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [erroCancelar, setErroCancelar] = useState<ErroApi | null>(null);

  const [erroAcao, setErroAcao] = useState<string | null>(null);

  async function criar(): Promise<void> {
    setEnviandoNovo(true);
    setErroNovo(null);
    const offset = offsetLocal();
    const resultado = await post('/api/agendamentos', {
      pacienteId: form.pacienteId,
      tipo: form.tipo,
      titulo: form.titulo,
      ...(form.local.trim() ? { local: form.local.trim() } : {}),
      inicioEm: `${form.data}T${form.horaInicio}:00${offset}`,
      fimEm: `${form.data}T${form.horaFim}:00${offset}`,
      ...(form.observacoes.trim() ? { observacoes: form.observacoes.trim() } : {}),
    });
    setEnviandoNovo(false);
    if (!resultado.ok) {
      setErroNovo(resultado.erro);
      return;
    }
    setNovoAberto(false);
    setForm(FORM_VAZIO);
    agenda.recarregar();
  }

  async function confirmar(a: Agendamento): Promise<void> {
    setErroAcao(null);
    const resultado = await patch(`/api/agendamentos/${a.id}`, { status: 'CONFIRMADO' });
    if (!resultado.ok) {
      setErroAcao(resultado.erro.mensagem);
      return;
    }
    agenda.recarregar();
  }

  async function concluir(a: Agendamento, status: 'REALIZADO' | 'NAO_COMPARECEU'): Promise<void> {
    setErroAcao(null);
    const resultado = await post(`/api/agendamentos/${a.id}/concluir`, { status });
    if (!resultado.ok) {
      setErroAcao(resultado.erro.mensagem);
      return;
    }
    agenda.recarregar();
  }

  async function confirmarCancelamento(): Promise<void> {
    if (!paraCancelar || motivoCancelar.trim() === '') return;
    setCancelando(true);
    setErroCancelar(null);
    const resultado = await post(`/api/agendamentos/${paraCancelar.id}/cancelar`, { motivo: motivoCancelar.trim() });
    setCancelando(false);
    if (!resultado.ok) {
      setErroCancelar(resultado.erro);
      return;
    }
    setParaCancelar(null);
    setMotivoCancelar('');
    agenda.recarregar();
  }

  const encerrado = (status: Agendamento['status']) => status === 'CANCELADO' || status === 'REALIZADO' || status === 'NAO_COMPARECEU';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Agenda da RT</h1>
        <Button size="sm" onClick={() => setNovoAberto(true)}>
          Novo agendamento
        </Button>
      </div>

      {erroAcao ? <EstadoErro mensagem={erroAcao} /> : null}
      {agenda.carregando ? <EstadoCarregando texto="Carregando agenda…" /> : null}
      {agenda.erro ? <EstadoErro mensagem={agenda.erro} /> : null}
      {agenda.dados && agenda.dados.length === 0 ? <EstadoVazio texto="Nenhum agendamento neste mês." /> : null}

      {agenda.dados && agenda.dados.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {agenda.dados.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">
                  {a.pacienteNome} · {a.titulo}
                </p>
                <p className="text-slate-500">
                  {new Date(a.inicioEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  {a.local ? ` · ${a.local}` : ''}
                  {a.acompanhanteNome ? ` · acompanhado por ${a.acompanhanteNome}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={a.tipo === 'CONSULTA' ? 'default' : 'secondary'}>{a.tipo === 'CONSULTA' ? 'Consulta' : 'Saída'}</Badge>
                <Badge variant={variantePorStatus(a.status)}>{ROTULO_STATUS[a.status]}</Badge>
                {!encerrado(a.status) ? (
                  <>
                    {a.status === 'AGENDADO' ? (
                      <Button size="sm" variant="outline" onClick={() => void confirmar(a)}>
                        Confirmar
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => void concluir(a, 'REALIZADO')}>
                      Realizado
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void concluir(a, 'NAO_COMPARECEU')}>
                      Não compareceu
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setParaCancelar(a)}>
                      Cancelar
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog aberto={novoAberto} onFechar={() => setNovoAberto(false)} titulo="Novo agendamento">
        <div className="space-y-3 text-sm">
          <label className="flex flex-col gap-1">
            Paciente
            <select value={form.pacienteId} onChange={(e) => setForm((f) => ({ ...f, pacienteId: e.target.value }))} className="rounded border border-slate-300 p-2">
              <option value="">Selecione…</option>
              {pacientes.dados?.itens.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            Tipo
            <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as 'CONSULTA' | 'SAIDA' }))} className="rounded border border-slate-300 p-2">
              <option value="CONSULTA">Consulta</option>
              <option value="SAIDA">Saída</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            Título
            <input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} className="rounded border border-slate-300 p-2" placeholder="Ex.: Cardiologia, passeio ao parque" />
          </label>

          <label className="flex flex-col gap-1">
            Local (opcional)
            <input value={form.local} onChange={(e) => setForm((f) => ({ ...f, local: e.target.value }))} className="rounded border border-slate-300 p-2" />
          </label>

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              Data
              <input type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} className="rounded border border-slate-300 p-2" />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              Início
              <input type="time" value={form.horaInicio} onChange={(e) => setForm((f) => ({ ...f, horaInicio: e.target.value }))} className="rounded border border-slate-300 p-2" />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              Fim
              <input type="time" value={form.horaFim} onChange={(e) => setForm((f) => ({ ...f, horaFim: e.target.value }))} className="rounded border border-slate-300 p-2" />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            Observações (opcional)
            <textarea value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} rows={2} className="rounded border border-slate-300 p-2" />
          </label>

          {erroNovo ? (
            <div className="space-y-1">
              <p role="alert" className="text-sm text-red-700">
                {erroNovo.mensagem}
              </p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNovoAberto(false)} disabled={enviandoNovo}>
              Cancelar
            </Button>
            <Button onClick={() => void criar()} disabled={enviandoNovo || !form.pacienteId || !form.titulo.trim()}>
              {enviandoNovo ? 'Salvando…' : 'Criar agendamento'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog aberto={paraCancelar !== null} onFechar={() => setParaCancelar(null)} titulo="Cancelar agendamento">
        {paraCancelar ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-slate-900">
              {paraCancelar.pacienteNome} · {paraCancelar.titulo}
            </p>
            <label className="flex flex-col gap-1">
              Motivo
              <textarea value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)} rows={2} className="rounded border border-slate-300 p-2" />
            </label>
            {erroCancelar ? <p role="alert" className="text-sm text-red-700">{erroCancelar.mensagem}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setParaCancelar(null)} disabled={cancelando}>
                Voltar
              </Button>
              <Button variant="destructive" onClick={() => void confirmarCancelamento()} disabled={cancelando || motivoCancelar.trim() === ''}>
                {cancelando ? 'Enviando…' : 'Confirmar cancelamento'}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
