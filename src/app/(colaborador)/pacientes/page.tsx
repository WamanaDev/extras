'use client';

/**
 * `/(colaborador)/pacientes` — API-PAC-001. Lista pacientes ativos da
 * própria RT (RNP-01) — a rota nunca aceita `rtId`, então não há seletor de
 * unidade aqui (FE-003.1).
 */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';

interface PacienteItem {
  id: string;
  nome: string;
  status: 'ATIVO' | 'INATIVO';
}

export default function PacientesPage(): JSX.Element {
  const pacientes = useRecursoApi<{ itens: PacienteItem[] }>('/api/pacientes');

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Pacientes</h1>

      {pacientes.carregando ? <EstadoCarregando texto="Carregando pacientes…" /> : null}
      {pacientes.erro ? <EstadoErro mensagem={pacientes.erro} /> : null}
      {!pacientes.carregando && !pacientes.erro && pacientes.dados?.itens.length === 0 ? (
        <EstadoVazio texto="Nenhum paciente cadastrado na sua RT ainda." />
      ) : null}

      {pacientes.dados && pacientes.dados.itens.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {pacientes.dados.itens.map((paciente) => (
            <li key={paciente.id}>
              <Link
                href={`/pacientes/${paciente.id}`}
                className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
              >
                <span className="font-medium text-slate-900">{paciente.nome}</span>
                <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
