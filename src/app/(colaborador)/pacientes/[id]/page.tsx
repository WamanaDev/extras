'use client';

/**
 * `/(colaborador)/pacientes/:id` — API-PAC-002. Detalhe do paciente da
 * própria RT: dados, responsável, próximos agendamentos e atalho para o MAR.
 * `404` (de `RECURSO_NAO_ENCONTRADO`) cobre tanto inexistente quanto de
 * outra RT — a tela mostra o mesmo estado de erro para os dois casos
 * (API-000, não vaza existência).
 */
import { use } from 'react';
import Link from 'next/link';
import { Pill, CalendarPlus } from 'lucide-react';
import { useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface AgendamentoResumo {
  id: string;
  tipo: 'CONSULTA' | 'SAIDA';
  titulo: string;
  inicioEm: string;
  status: string;
}

interface PacienteDetalhe {
  id: string;
  nome: string;
  dataNascimento: string;
  nomeResponsavel: string | null;
  contatoResponsavel: string | null;
  observacoesClinicas: string | null;
  proximosAgendamentos: AgendamentoResumo[];
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PacienteDetalhePage({ params }: { params: Promise<{ id: string }> }): JSX.Element {
  const { id } = use(params);
  const paciente = useRecursoApi<PacienteDetalhe>(`/api/pacientes/${id}`);

  if (paciente.carregando) return <EstadoCarregando texto="Carregando paciente…" />;
  if (paciente.erro) return <EstadoErro mensagem={paciente.erro} />;
  if (!paciente.dados) return <EstadoErro mensagem="Paciente não encontrado." />;

  const p = paciente.dados;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{p.nome}</h1>
          <p className="text-sm text-slate-500">
            Nascimento: {new Date(p.dataNascimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/agenda-rt?pacienteId=${p.id}`}>
            <Button variant="outline" size="sm">
              <CalendarPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Novo agendamento
            </Button>
          </Link>
          <Link href={`/pacientes/${p.id}/medicamentos`}>
            <Button size="sm">
              <Pill className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Medicamentos
            </Button>
          </Link>
        </div>
      </div>

      {p.nomeResponsavel || p.contatoResponsavel ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 className="mb-1 font-semibold text-slate-900">Responsável</h2>
          <p className="text-slate-700">
            {p.nomeResponsavel ?? '—'} {p.contatoResponsavel ? `· ${p.contatoResponsavel}` : ''}
          </p>
        </section>
      ) : null}

      {p.observacoesClinicas ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <h2 className="mb-1 font-semibold">Observações clínicas</h2>
          <p className="whitespace-pre-wrap">{p.observacoesClinicas}</p>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Próximos agendamentos</h2>
        {p.proximosAgendamentos.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum agendamento futuro.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {p.proximosAgendamentos.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{a.titulo}</p>
                  <p className="text-slate-500">{formatarDataHora(a.inicioEm)}</p>
                </div>
                <Badge variant={a.tipo === 'CONSULTA' ? 'default' : 'secondary'}>
                  {a.tipo === 'CONSULTA' ? 'Consulta' : 'Saída'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
