'use client';

/**
 * `/admin/pacientes/:id` — API-ADM-PAC-003/004. Edição de cadastro,
 * transferência de RT e inativação (RNP-02/RNP-04). Não existe
 * `GET /api/admin/pacientes/:id` — dados vêm da listagem filtrada, mesmo
 * padrão de `/admin/colaboradores/:id`.
 */
import { use, useState } from 'react';
import { useListaApi, useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { patch, post, type ErroApi } from '@/lib/api/client';

interface PacienteListado {
  id: string;
  nome: string;
  dataNascimento: string;
  rtId: string;
  rtNome: string;
  status: 'ATIVO' | 'INATIVO';
}

interface Rt {
  id: string;
  nome: string;
}

export default function PacienteAdminDetalhePage({ params }: { params: Promise<{ id: string }> }): JSX.Element {
  const { id } = use(params);
  const pacientes = useListaApi<PacienteListado>('/api/admin/pacientes?tamanho=200');
  const paciente = pacientes.dados?.itens.find((p) => p.id === id) ?? null;
  const rts = useRecursoApi<{ itens: Rt[] }>('/api/admin/rts');

  const [nome, setNome] = useState<string | null>(null);
  const [rtId, setRtId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);

  const [inativarAberto, setInativarAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [inativando, setInativando] = useState(false);
  const [erroInativar, setErroInativar] = useState<ErroApi | null>(null);

  if (pacientes.carregando) return <EstadoCarregando texto="Carregando paciente…" />;
  if (pacientes.erro) return <EstadoErro mensagem={pacientes.erro} />;
  if (!paciente) return <EstadoErro mensagem="Paciente não encontrado." />;

  async function salvar(): Promise<void> {
    setSalvando(true);
    setErro(null);
    const resultado = await patch(`/api/admin/pacientes/${id}`, {
      ...(nome !== null && nome !== paciente!.nome ? { nome } : {}),
      ...(rtId !== null && rtId !== paciente!.rtId ? { rtId } : {}),
    });
    setSalvando(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    setNome(null);
    setRtId(null);
    pacientes.recarregar();
  }

  async function inativar(): Promise<void> {
    if (motivo.trim() === '') return;
    setInativando(true);
    setErroInativar(null);
    const resultado = await post(`/api/admin/pacientes/${id}/inativar`, { motivo: motivo.trim() });
    setInativando(false);
    if (!resultado.ok) {
      setErroInativar(resultado.erro);
      return;
    }
    setInativarAberto(false);
    setMotivo('');
    pacientes.recarregar();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{paciente.nome}</h1>
        <Badge variant={paciente.status === 'ATIVO' ? 'success' : 'secondary'}>{paciente.status === 'ATIVO' ? 'Ativo' : 'Inativo'}</Badge>
      </div>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <label className="flex flex-col gap-1">
          Nome
          <input value={nome ?? paciente.nome} onChange={(e) => setNome(e.target.value)} className="rounded border border-slate-300 p-2" />
        </label>
        <label className="flex flex-col gap-1">
          RT (transferência — RNP-03: agendamentos já existentes mantêm a RT original)
          <select value={rtId ?? paciente.rtId} onChange={(e) => setRtId(e.target.value)} className="rounded border border-slate-300 p-2">
            {rts.dados?.itens.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.nome}
              </option>
            ))}
          </select>
        </label>
        {erro ? <p role="alert" className="text-sm text-red-700">{erro.mensagem}</p> : null}
        <div className="flex justify-end">
          <Button onClick={() => void salvar()} disabled={salvando || (nome === null && rtId === null)}>
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </div>
      </section>

      {paciente.status === 'ATIVO' ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-red-900">Inativar paciente</h2>
          <p className="mb-3 text-sm text-red-800">Cancela agendamentos futuros em aberto e encerra prescrições ativas.</p>
          <Button variant="destructive" size="sm" onClick={() => setInativarAberto(true)}>
            Inativar
          </Button>
        </section>
      ) : null}

      <Dialog aberto={inativarAberto} onFechar={() => setInativarAberto(false)} titulo="Inativar paciente">
        <div className="space-y-3 text-sm">
          <p>Isto cancela todos os agendamentos futuros em aberto e encerra as prescrições ativas de {paciente.nome}.</p>
          <label className="flex flex-col gap-1">
            Motivo
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className="rounded border border-slate-300 p-2" />
          </label>
          {erroInativar ? <p role="alert" className="text-sm text-red-700">{erroInativar.mensagem}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInativarAberto(false)} disabled={inativando}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={() => void inativar()} disabled={inativando || motivo.trim() === ''}>
              {inativando ? 'Inativando…' : 'Confirmar inativação'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
