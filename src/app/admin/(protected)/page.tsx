'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useListaApi, useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';

interface CicloListado {
  id: string;
  ano: number;
  mes: number;
  status: string;
  totais: { plantoes: number; vagas: number; ocupadas: number; colaboradoresComEscala: number };
}

interface DiaCobertura {
  data: string;
  rt: string;
  turno: string;
  total: number;
  minimo: number;
  deficit: number;
}

interface RespostaCobertura {
  dias: DiaCobertura[];
  resumo: { diasComDeficit: number; deficitTotal: number };
}

/**
 * `/admin` — FE-001, API-ADM-CIC-008.
 *
 * Não há um único "ciclo atual" no contrato — o painel escolhe o ciclo
 * `PUBLICADO` mais recente (o que está de fato em operação); na ausência de
 * um publicado, cai para o rascunho mais recente. Cobertura vem sempre de
 * `API-ADM-CIC-008` (FE-001.5: nenhum déficit é calculado no cliente).
 */
export default function AdminDashboardPage(): JSX.Element {
  const ciclos = useListaApi<CicloListado>('/api/admin/ciclos?tamanho=50');

  const cicloFoco = useMemo(() => {
    const itens = ciclos.dados?.itens ?? [];
    return itens.find((c) => c.status === 'PUBLICADO') ?? itens[0] ?? null;
  }, [ciclos.dados]);

  const cobertura = useRecursoApi<RespostaCobertura>(
    cicloFoco ? `/api/admin/ciclos/${encodeURIComponent(cicloFoco.id)}/cobertura?apenasDeficit=true` : null,
  );

  if (ciclos.carregando) return <EstadoCarregando texto="Carregando painel…" />;
  if (ciclos.erro) return <EstadoErro mensagem={ciclos.erro} />;
  if (!ciclos.dados || ciclos.dados.itens.length === 0) {
    return (
      <div className="space-y-4">
        <EstadoVazio texto="Nenhum ciclo cadastrado ainda." />
        <Link href="/admin/ciclos" className="text-sm font-medium text-slate-900 underline">
          Criar o primeiro ciclo
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Painel</h1>

      {cicloFoco ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Ciclo em foco: {String(cicloFoco.mes).padStart(2, '0')}/{cicloFoco.ano}
            </h2>
            <Badge variant={cicloFoco.status === 'PUBLICADO' ? 'success' : 'secondary'}>{cicloFoco.status}</Badge>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-slate-500">Plantões</dt>
              <dd className="font-medium text-slate-900">{cicloFoco.totais.plantoes}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Vagas</dt>
              <dd className="font-medium text-slate-900">
                {cicloFoco.totais.ocupadas}/{cicloFoco.totais.vagas}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Vagas em aberto</dt>
              <dd className="font-medium text-slate-900">{Math.max(cicloFoco.totais.vagas - cicloFoco.totais.ocupadas, 0)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Colaboradores escalados</dt>
              <dd className="font-medium text-slate-900">{cicloFoco.totais.colaboradoresComEscala}</dd>
            </div>
          </dl>
          <Link href={`/admin/ciclos/${cicloFoco.id}`} className="mt-3 inline-block text-sm font-medium text-slate-900 underline">
            Ver ciclo
          </Link>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Alertas de cobertura</h2>
        {cobertura.carregando ? (
          <EstadoCarregando texto="Calculando cobertura…" />
        ) : cobertura.erro ? (
          <EstadoErro mensagem={cobertura.erro} />
        ) : !cobertura.dados || cobertura.dados.dias.length === 0 ? (
          <EstadoVazio texto="Sem déficit de cobertura no ciclo em foco." />
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600">
              {cobertura.dados.resumo.diasComDeficit} dia(s)/turno com déficit — {cobertura.dados.resumo.deficitTotal} vaga(s) faltando ao
              total.
            </p>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {cobertura.dados.dias.map((dia, indice) => (
                // eslint-disable-next-line react/no-array-index-key -- linhas de cobertura não têm id próprio
                <li key={indice} className="flex items-center justify-between py-1.5">
                  <span>
                    {dia.data} · {dia.rt} · {dia.turno === 'DIURNO' ? 'Diurno' : 'Noturno'}
                  </span>
                  <Badge variant="destructive">
                    {dia.total}/{dia.minimo}
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Todos os ciclos</h2>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {ciclos.dados.itens.map((ciclo) => (
            <li key={ciclo.id} className="flex items-center justify-between py-1.5">
              <Link href={`/admin/ciclos/${ciclo.id}`} className="font-medium text-slate-900 underline">
                {String(ciclo.mes).padStart(2, '0')}/{ciclo.ano}
              </Link>
              <Badge variant={ciclo.status === 'PUBLICADO' ? 'success' : ciclo.status === 'FECHADO' ? 'outline' : 'secondary'}>
                {ciclo.status}
              </Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
