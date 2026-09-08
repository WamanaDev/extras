'use client';

/**
 * `/admin/pacientes` — API-ADM-PAC-001/002. Único ponto do sistema que
 * enxerga pacientes de ambas as RTs ao mesmo tempo (admin não tem o escopo
 * de `RNP-01`, que é regra do colaborador).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useListaApi, useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { post, type ErroApi } from '@/lib/api/client';

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

const FORM_VAZIO = {
  nome: '',
  dataNascimento: '',
  rtId: '',
  cpf: '',
  nomeResponsavel: '',
  contatoResponsavel: '',
  observacoesClinicas: '',
};

export default function PacientesAdminPage(): JSX.Element {
  const [rtFiltro, setRtFiltro] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<'ATIVO' | 'INATIVO' | ''>('ATIVO');

  const query = new URLSearchParams({ tamanho: '100', ...(rtFiltro ? { rtId: rtFiltro } : {}), ...(statusFiltro ? { status: statusFiltro } : {}) });
  const pacientes = useListaApi<PacienteListado>(`/api/admin/pacientes?${query.toString()}`);
  const rts = useRecursoApi<{ itens: Rt[] }>('/api/admin/rts');

  const [form, setForm] = useState(FORM_VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);

  async function criar(): Promise<void> {
    setEnviando(true);
    setErro(null);
    const resultado = await post('/api/admin/pacientes', {
      nome: form.nome,
      dataNascimento: form.dataNascimento,
      rtId: form.rtId,
      ...(form.cpf.trim() ? { cpf: form.cpf.trim() } : {}),
      ...(form.nomeResponsavel.trim() ? { nomeResponsavel: form.nomeResponsavel.trim() } : {}),
      ...(form.contatoResponsavel.trim() ? { contatoResponsavel: form.contatoResponsavel.trim() } : {}),
      ...(form.observacoesClinicas.trim() ? { observacoesClinicas: form.observacoesClinicas.trim() } : {}),
    });
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    setForm(FORM_VAZIO);
    pacientes.recarregar();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Pacientes</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Novo paciente</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void criar();
          }}
        >
          <label className="flex flex-col text-sm">
            Nome
            <input required value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} className="rounded border border-slate-300 p-2" />
          </label>
          <label className="flex flex-col text-sm">
            Nascimento
            <input required type="date" value={form.dataNascimento} onChange={(e) => setForm((f) => ({ ...f, dataNascimento: e.target.value }))} className="rounded border border-slate-300 p-2" />
          </label>
          <label className="flex flex-col text-sm">
            RT
            <select required value={form.rtId} onChange={(e) => setForm((f) => ({ ...f, rtId: e.target.value }))} className="rounded border border-slate-300 p-2">
              <option value="">Selecione…</option>
              {rts.dados?.itens.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            Responsável (opcional)
            <input value={form.nomeResponsavel} onChange={(e) => setForm((f) => ({ ...f, nomeResponsavel: e.target.value }))} className="rounded border border-slate-300 p-2" />
          </label>
          <label className="flex flex-col text-sm">
            Contato do responsável (opcional)
            <input value={form.contatoResponsavel} onChange={(e) => setForm((f) => ({ ...f, contatoResponsavel: e.target.value }))} className="rounded border border-slate-300 p-2" />
          </label>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Cadastrar'}
          </Button>
        </form>
        <label className="mt-3 flex flex-col text-sm">
          Observações clínicas (opcional, restrito)
          <textarea
            value={form.observacoesClinicas}
            onChange={(e) => setForm((f) => ({ ...f, observacoesClinicas: e.target.value }))}
            rows={2}
            className="w-full rounded border border-slate-300 p-2"
          />
        </label>
        {erro ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {erro.mensagem}
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-3">
        <select value={rtFiltro} onChange={(e) => setRtFiltro(e.target.value)} className="rounded border border-slate-300 p-2 text-sm">
          <option value="">Todas as RTs</option>
          {rts.dados?.itens.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {rt.nome}
            </option>
          ))}
        </select>
        <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as 'ATIVO' | 'INATIVO' | '')} className="rounded border border-slate-300 p-2 text-sm">
          <option value="ATIVO">Ativos</option>
          <option value="INATIVO">Inativos</option>
          <option value="">Todos</option>
        </select>
      </div>

      {pacientes.carregando ? <EstadoCarregando /> : null}
      {pacientes.erro ? <EstadoErro mensagem={pacientes.erro} /> : null}
      {pacientes.dados && pacientes.dados.itens.length === 0 ? <EstadoVazio texto="Nenhum paciente encontrado." /> : null}

      {pacientes.dados && pacientes.dados.itens.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {pacientes.dados.itens.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/pacientes/${p.id}`} className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-slate-50">
                <div>
                  <p className="font-medium text-slate-900">{p.nome}</p>
                  <p className="text-slate-500">{p.rtNome}</p>
                </div>
                <Badge variant={p.status === 'ATIVO' ? 'success' : 'secondary'}>{p.status === 'ATIVO' ? 'Ativo' : 'Inativo'}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
