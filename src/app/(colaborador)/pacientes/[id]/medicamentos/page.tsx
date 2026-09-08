'use client';

/**
 * `/(colaborador)/pacientes/:id/medicamentos` — MAR do paciente
 * (API-MED-001/002/005..008/009). Checagem dupla (RNP-25..27): o botão de
 * cada etapa só aparece para quem pode de fato executá-la — o servidor
 * recusa de qualquer forma, mas a ausência do controle evita um 409/403
 * confuso (FE-003.6/FE-003.7).
 */
import { use, useState } from 'react';
import { useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { get, post, type ErroApi } from '@/lib/api/client';
import { useAgendaPacientesRealtime } from '@/hooks/useAgendaPacientesRealtime';

interface Prescricao {
  id: string;
  medicamentoNome: string;
  dose: string;
  via: string;
  tipo: 'REGULAR' | 'PRN';
  duracao: 'DEFINITIVA' | 'TEMPORARIA';
  horarios: string[];
  dataInicio: string;
  dataFim: string | null;
  instrucoes: string | null;
  status: string;
}

interface Administracao {
  id: string;
  prescricaoId: string;
  medicamentoNome: string;
  dose: string;
  horarioPrevisto: string | null;
  status: 'PENDENTE' | 'SEPARADO' | 'CONFERIDO' | 'DIVERGENTE' | 'ADMINISTRADO' | 'RECUSADO' | 'NAO_ADMINISTRADO';
  separadoPorId: string | null;
  separadoPorNome: string | null;
  conferidoPorId: string | null;
  conferidoPorNome: string | null;
  administradoPorId: string | null;
  administradoPorNome: string | null;
  observacao: string | null;
}

interface Medicamento {
  id: string;
  nome: string;
}

interface RespostaMe {
  tipo: 'COLABORADOR' | 'ADMIN';
  colaborador?: { id: string };
}

const ROTULO_STATUS: Record<Administracao['status'], string> = {
  PENDENTE: 'Pendente',
  SEPARADO: 'Separado — aguardando conferência',
  CONFERIDO: 'Conferido — aguardando administração',
  DIVERGENTE: 'Divergência na conferência',
  ADMINISTRADO: 'Administrado',
  RECUSADO: 'Recusado pelo paciente',
  NAO_ADMINISTRADO: 'Não administrado (prescrição encerrada)',
};

function variantePorStatus(status: Administracao['status']): 'default' | 'secondary' | 'warning' | 'destructive' | 'success' {
  switch (status) {
    case 'ADMINISTRADO':
      return 'success';
    case 'RECUSADO':
    case 'DIVERGENTE':
      return 'destructive';
    case 'SEPARADO':
    case 'CONFERIDO':
      return 'warning';
    default:
      return 'secondary';
  }
}

function formatarHora(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'sob demanda';
}

const FORM_VAZIO = {
  medicamentoId: '',
  medicamentoNome: '',
  tipo: 'REGULAR' as 'REGULAR' | 'PRN',
  duracao: 'TEMPORARIA' as 'DEFINITIVA' | 'TEMPORARIA',
  dose: '',
  via: '',
  horarios: '',
  dataInicio: new Date().toISOString().slice(0, 10),
  dataFim: '',
  prescritoPor: '',
  instrucoes: '',
};

export default function MedicamentosPage({ params }: { params: Promise<{ id: string }> }): JSX.Element {
  const { id: pacienteId } = use(params);

  const prescricoes = useRecursoApi<Prescricao[]>(`/api/pacientes/${pacienteId}/prescricoes?status=ATIVA`);
  const administracoes = useRecursoApi<Administracao[]>(`/api/pacientes/${pacienteId}/administracoes`);
  const me = useRecursoApi<RespostaMe>('/api/auth/me');
  const meuId = me.dados?.tipo === 'COLABORADOR' ? me.dados.colaborador?.id ?? null : null;
  const rtInfo = useRecursoApi<{ rtId: string }>('/api/colaborador/rt');
  useAgendaPacientesRealtime(rtInfo.dados?.rtId, () => {
    administracoes.recarregar();
    prescricoes.recarregar();
  });

  const [novaReceitaAberta, setNovaReceitaAberta] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [buscaMedicamento, setBuscaMedicamento] = useState<Medicamento[]>([]);
  const [enviandoReceita, setEnviandoReceita] = useState(false);
  const [erroReceita, setErroReceita] = useState<ErroApi | null>(null);

  const [conferindo, setConferindo] = useState<Administracao | null>(null);
  const [conferenciaConfere, setConferenciaConfere] = useState(true);
  const [conferenciaObs, setConferenciaObs] = useState('');
  const [enviandoConferencia, setEnviandoConferencia] = useState(false);
  const [erroConferencia, setErroConferencia] = useState<ErroApi | null>(null);

  const [administrando, setAdministrando] = useState<Administracao | null>(null);
  const [administrarStatus, setAdministrarStatus] = useState<'ADMINISTRADO' | 'RECUSADO'>('ADMINISTRADO');
  const [administrarObs, setAdministrarObs] = useState('');
  const [enviandoAdministracao, setEnviandoAdministracao] = useState(false);
  const [erroAdministracao, setErroAdministracao] = useState<ErroApi | null>(null);

  const [erroAcao, setErroAcao] = useState<string | null>(null);

  async function buscarMedicamentos(termo: string): Promise<void> {
    setForm((f) => ({ ...f, medicamentoNome: termo, medicamentoId: '' }));
    if (termo.trim().length < 2) {
      setBuscaMedicamento([]);
      return;
    }
    const resultado = await get<Medicamento[]>(`/api/medicamentos?busca=${encodeURIComponent(termo.trim())}`);
    if (resultado.ok) setBuscaMedicamento(resultado.dados);
  }

  async function garantirMedicamentoId(): Promise<string | null> {
    if (form.medicamentoId) return form.medicamentoId;
    if (!form.medicamentoNome.trim()) return null;
    const criado = await post<Medicamento>('/api/medicamentos', { nome: form.medicamentoNome.trim() });
    return criado.ok ? criado.dados.id : null;
  }

  async function criarPrescricao(): Promise<void> {
    setEnviandoReceita(true);
    setErroReceita(null);
    const medicamentoId = await garantirMedicamentoId();
    if (!medicamentoId) {
      setEnviandoReceita(false);
      setErroReceita({ erro: 'MEDICAMENTO_INEXISTENTE', mensagem: 'Informe o nome do medicamento.', detalhes: null, requestId: '' });
      return;
    }
    const resultado = await post(`/api/pacientes/${pacienteId}/prescricoes`, {
      medicamentoId,
      tipo: form.tipo,
      duracao: form.duracao,
      dose: form.dose,
      via: form.via,
      ...(form.tipo === 'REGULAR' ? { horarios: form.horarios.split(',').map((h) => h.trim()).filter(Boolean) } : {}),
      dataInicio: form.dataInicio,
      ...(form.duracao === 'TEMPORARIA' && form.dataFim ? { dataFim: form.dataFim } : {}),
      prescritoPor: form.prescritoPor,
      ...(form.instrucoes.trim() ? { instrucoes: form.instrucoes.trim() } : {}),
    });
    setEnviandoReceita(false);
    if (!resultado.ok) {
      setErroReceita(resultado.erro);
      return;
    }
    setNovaReceitaAberta(false);
    setForm(FORM_VAZIO);
    prescricoes.recarregar();
    administracoes.recarregar();
  }

  async function separar(prescricaoId: string, horarioPrevisto: string | null): Promise<void> {
    setErroAcao(null);
    const resultado = await post(`/api/prescricoes/${prescricaoId}/separar`, horarioPrevisto ? { horarioPrevisto } : {});
    if (!resultado.ok) {
      setErroAcao(resultado.erro.mensagem);
      return;
    }
    administracoes.recarregar();
  }

  function abrirConferencia(administracao: Administracao): void {
    setErroConferencia(null);
    setConferenciaConfere(true);
    setConferenciaObs('');
    setConferindo(administracao);
  }

  async function confirmarConferencia(): Promise<void> {
    if (!conferindo) return;
    if (!conferenciaConfere && conferenciaObs.trim() === '') return;
    setEnviandoConferencia(true);
    setErroConferencia(null);
    const resultado = await post(`/api/administracoes/${conferindo.id}/conferir`, {
      confere: conferenciaConfere,
      ...(conferenciaObs.trim() ? { observacao: conferenciaObs.trim() } : {}),
    });
    setEnviandoConferencia(false);
    if (!resultado.ok) {
      setErroConferencia(resultado.erro);
      return;
    }
    setConferindo(null);
    administracoes.recarregar();
  }

  function abrirAdministracao(administracao: Administracao): void {
    setErroAdministracao(null);
    setAdministrarStatus('ADMINISTRADO');
    setAdministrarObs('');
    setAdministrando(administracao);
  }

  async function confirmarAdministracao(): Promise<void> {
    if (!administrando) return;
    if (administrarStatus === 'RECUSADO' && administrarObs.trim() === '') return;
    setEnviandoAdministracao(true);
    setErroAdministracao(null);
    const resultado = await post(`/api/administracoes/${administrando.id}/administrar`, {
      status: administrarStatus,
      ...(administrarObs.trim() ? { observacao: administrarObs.trim() } : {}),
    });
    setEnviandoAdministracao(false);
    if (!resultado.ok) {
      setErroAdministracao(resultado.erro);
      return;
    }
    setAdministrando(null);
    administracoes.recarregar();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Medicamentos</h1>
        <Button size="sm" onClick={() => setNovaReceitaAberta(true)}>
          Nova receita
        </Button>
      </div>

      {erroAcao ? <EstadoErro mensagem={erroAcao} /> : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Prescrições ativas</h2>
        {prescricoes.carregando ? <EstadoCarregando /> : null}
        {prescricoes.erro ? <EstadoErro mensagem={prescricoes.erro} /> : null}
        {prescricoes.dados && prescricoes.dados.length === 0 ? <EstadoVazio texto="Nenhuma prescrição ativa." /> : null}
        {prescricoes.dados && prescricoes.dados.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {prescricoes.dados.map((p) => (
              <li key={p.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <p className="font-medium text-slate-900">
                  {p.medicamentoNome} · {p.dose} · {p.via}
                </p>
                <p className="text-slate-500">
                  {p.tipo === 'REGULAR' ? p.horarios.join(', ') : 'Se necessário (PRN)'} ·{' '}
                  {p.duracao === 'DEFINITIVA' ? 'uso contínuo' : `até ${p.dataFim}`}
                </p>
                {p.tipo === 'PRN' ? (
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => void separar(p.id, null)}>
                    Separar dose agora
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Doses de hoje</h2>
        {administracoes.carregando ? <EstadoCarregando /> : null}
        {administracoes.erro ? <EstadoErro mensagem={administracoes.erro} /> : null}
        {administracoes.dados && administracoes.dados.length === 0 ? <EstadoVazio texto="Nenhuma dose prevista para hoje." /> : null}
        {administracoes.dados && administracoes.dados.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {administracoes.dados.map((a) => {
              const podeConferir = a.status === 'SEPARADO' && a.separadoPorId !== meuId;
              const podeAdministrar = a.status === 'CONFERIDO' && (a.separadoPorId === meuId || a.conferidoPorId === meuId);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">
                      {a.medicamentoNome} · {a.dose} · {formatarHora(a.horarioPrevisto)}
                    </p>
                    <p className="text-slate-500">
                      {a.separadoPorNome ? `Separado por ${a.separadoPorNome}` : ''}
                      {a.conferidoPorNome ? ` · Conferido por ${a.conferidoPorNome}` : ''}
                      {a.administradoPorNome ? ` · Administrado por ${a.administradoPorNome}` : ''}
                    </p>
                    {a.observacao ? <p className="text-slate-500 italic">&ldquo;{a.observacao}&rdquo;</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={variantePorStatus(a.status)}>{ROTULO_STATUS[a.status]}</Badge>
                    {a.status === 'PENDENTE' ? (
                      <Button size="sm" variant="outline" onClick={() => void separar(a.prescricaoId, a.horarioPrevisto)}>
                        Separar
                      </Button>
                    ) : null}
                    {podeConferir ? (
                      <Button size="sm" variant="outline" onClick={() => abrirConferencia(a)}>
                        Conferir
                      </Button>
                    ) : null}
                    {podeAdministrar ? (
                      <Button size="sm" onClick={() => abrirAdministracao(a)}>
                        Administrar
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {/* Nova receita */}
      <Dialog aberto={novaReceitaAberta} onFechar={() => setNovaReceitaAberta(false)} titulo="Nova receita">
        <div className="space-y-3 text-sm">
          <label className="flex flex-col gap-1">
            Medicamento
            <input
              value={form.medicamentoNome}
              onChange={(e) => void buscarMedicamentos(e.target.value)}
              className="rounded border border-slate-300 p-2"
              placeholder="Buscar ou digitar nome novo"
            />
            {buscaMedicamento.length > 0 ? (
              <ul className="rounded border border-slate-200">
                {buscaMedicamento.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="w-full p-1.5 text-left hover:bg-slate-50"
                      onClick={() => {
                        setForm((f) => ({ ...f, medicamentoId: m.id, medicamentoNome: m.nome }));
                        setBuscaMedicamento([]);
                      }}
                    >
                      {m.nome}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </label>

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              Frequência
              <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as 'REGULAR' | 'PRN' }))} className="rounded border border-slate-300 p-2">
                <option value="REGULAR">Horários fixos</option>
                <option value="PRN">Se necessário (PRN)</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1">
              Duração
              <select
                value={form.duracao}
                onChange={(e) => setForm((f) => ({ ...f, duracao: e.target.value as 'DEFINITIVA' | 'TEMPORARIA' }))}
                className="rounded border border-slate-300 p-2"
              >
                <option value="TEMPORARIA">Temporária</option>
                <option value="DEFINITIVA">Definitiva (contínua)</option>
              </select>
            </label>
          </div>

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              Dose
              <input value={form.dose} onChange={(e) => setForm((f) => ({ ...f, dose: e.target.value }))} className="rounded border border-slate-300 p-2" />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              Via
              <input value={form.via} onChange={(e) => setForm((f) => ({ ...f, via: e.target.value }))} className="rounded border border-slate-300 p-2" placeholder="Oral, IM…" />
            </label>
          </div>

          {form.tipo === 'REGULAR' ? (
            <label className="flex flex-col gap-1">
              Horários (separados por vírgula)
              <input
                value={form.horarios}
                onChange={(e) => setForm((f) => ({ ...f, horarios: e.target.value }))}
                className="rounded border border-slate-300 p-2"
                placeholder="08:00, 14:00, 20:00"
              />
            </label>
          ) : null}

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              Início
              <input type="date" value={form.dataInicio} onChange={(e) => setForm((f) => ({ ...f, dataInicio: e.target.value }))} className="rounded border border-slate-300 p-2" />
            </label>
            {form.duracao === 'TEMPORARIA' ? (
              <label className="flex flex-1 flex-col gap-1">
                Término
                <input type="date" value={form.dataFim} onChange={(e) => setForm((f) => ({ ...f, dataFim: e.target.value }))} className="rounded border border-slate-300 p-2" />
              </label>
            ) : null}
          </div>

          <label className="flex flex-col gap-1">
            Prescrito por
            <input value={form.prescritoPor} onChange={(e) => setForm((f) => ({ ...f, prescritoPor: e.target.value }))} className="rounded border border-slate-300 p-2" placeholder="Nome do médico" />
          </label>

          <label className="flex flex-col gap-1">
            Instruções (opcional)
            <textarea value={form.instrucoes} onChange={(e) => setForm((f) => ({ ...f, instrucoes: e.target.value }))} rows={2} className="rounded border border-slate-300 p-2" />
          </label>

          {erroReceita ? <p role="alert" className="text-sm text-red-700">{erroReceita.mensagem}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNovaReceitaAberta(false)} disabled={enviandoReceita}>
              Cancelar
            </Button>
            <Button
              onClick={() => void criarPrescricao()}
              disabled={enviandoReceita || !form.medicamentoNome.trim() || !form.dose.trim() || !form.via.trim() || !form.prescritoPor.trim()}
            >
              {enviandoReceita ? 'Salvando…' : 'Salvar receita'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Conferência */}
      <Dialog aberto={conferindo !== null} onFechar={() => setConferindo(null)} titulo="Conferir dose separada">
        {conferindo ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-slate-900">
              {conferindo.medicamentoNome} · {conferindo.dose} · separado por {conferindo.separadoPorNome}
            </p>
            <div className="flex gap-2">
              <Button variant={conferenciaConfere ? 'default' : 'outline'} onClick={() => setConferenciaConfere(true)}>
                Confere
              </Button>
              <Button variant={!conferenciaConfere ? 'destructive' : 'outline'} onClick={() => setConferenciaConfere(false)}>
                Não confere
              </Button>
            </div>
            {!conferenciaConfere ? (
              <label className="flex flex-col gap-1">
                O que está errado?
                <textarea value={conferenciaObs} onChange={(e) => setConferenciaObs(e.target.value)} rows={2} className="rounded border border-slate-300 p-2" />
                <span className="text-xs text-slate-500">Uma nova separação será necessária — esta tentativa fica registrada.</span>
              </label>
            ) : null}
            {erroConferencia ? <p role="alert" className="text-sm text-red-700">{erroConferencia.mensagem}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConferindo(null)} disabled={enviandoConferencia}>
                Voltar
              </Button>
              <Button
                variant={conferenciaConfere ? 'default' : 'destructive'}
                onClick={() => void confirmarConferencia()}
                disabled={enviandoConferencia || (!conferenciaConfere && conferenciaObs.trim() === '')}
              >
                {enviandoConferencia ? 'Enviando…' : 'Confirmar'}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      {/* Administração */}
      <Dialog aberto={administrando !== null} onFechar={() => setAdministrando(null)} titulo="Administrar dose">
        {administrando ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-slate-900">
              {administrando.medicamentoNome} · {administrando.dose}
            </p>
            <div className="flex gap-2">
              <Button variant={administrarStatus === 'ADMINISTRADO' ? 'default' : 'outline'} onClick={() => setAdministrarStatus('ADMINISTRADO')}>
                Administrado
              </Button>
              <Button variant={administrarStatus === 'RECUSADO' ? 'destructive' : 'outline'} onClick={() => setAdministrarStatus('RECUSADO')}>
                Recusado
              </Button>
            </div>
            {administrarStatus === 'RECUSADO' ? (
              <label className="flex flex-col gap-1">
                Motivo da recusa
                <textarea value={administrarObs} onChange={(e) => setAdministrarObs(e.target.value)} rows={2} className="rounded border border-slate-300 p-2" />
              </label>
            ) : null}
            {erroAdministracao ? <p role="alert" className="text-sm text-red-700">{erroAdministracao.mensagem}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdministrando(null)} disabled={enviandoAdministracao}>
                Voltar
              </Button>
              <Button
                variant={administrarStatus === 'RECUSADO' ? 'destructive' : 'default'}
                onClick={() => void confirmarAdministracao()}
                disabled={enviandoAdministracao || (administrarStatus === 'RECUSADO' && administrarObs.trim() === '')}
              >
                {enviandoAdministracao ? 'Enviando…' : 'Confirmar'}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
