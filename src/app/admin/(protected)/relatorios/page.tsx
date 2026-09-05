'use client';

import { useState } from 'react';
import { useListaApi, useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Button } from '@/components/ui/button';

interface CicloListado {
  id: string;
  ano: number;
  mes: number;
  status: string;
}

interface LinhaPorColaborador {
  id: string;
  nome: string;
  matricula: string;
  rt: string;
  plantoesBase: number;
  extras: number;
  extrasCruzadas: number;
  horasBase: number;
  horasExtras: number;
  folgas: number;
  limite: number;
  aproveitamento: number;
}

interface LinhaPorRt {
  rt: string;
  vagasOfertadas: number;
  vagasPreenchidas: number;
  taxaOcupacao: number;
  deficits: number;
}

interface RelatorioCiclo {
  porColaborador: LinhaPorColaborador[];
  porRt: LinhaPorRt[];
  resumo: { colaboradores: number; extrasTotais: number; horasTotais: number; vagasNaoPreenchidas: number };
}

/** `/admin/relatorios` — FE-001, API-ADM-REL-001/002. */
export default function RelatoriosPage(): JSX.Element {
  const ciclos = useListaApi<CicloListado>('/api/admin/ciclos?tamanho=100');
  const [cicloId, setCicloId] = useState<string | null>(null);
  const relatorio = useRecursoApi<RelatorioCiclo>(cicloId ? `/api/admin/relatorios/ciclo/${encodeURIComponent(cicloId)}` : null);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Relatórios</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        {ciclos.carregando ? (
          <EstadoCarregando texto="Carregando ciclos…" />
        ) : ciclos.erro ? (
          <EstadoErro mensagem={ciclos.erro} />
        ) : !ciclos.dados || ciclos.dados.itens.length === 0 ? (
          <EstadoVazio texto="Nenhum ciclo cadastrado." />
        ) : (
          <label className="flex flex-col text-sm">
            Ciclo
            <select
              value={cicloId ?? ''}
              onChange={(evento) => setCicloId(evento.target.value || null)}
              className="mt-1 w-56 rounded border border-slate-300 p-2"
            >
              <option value="">Selecione…</option>
              {ciclos.dados.itens.map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.mes).padStart(2, '0')}/{c.ano} ({c.status})
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {cicloId ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Consolidado</h2>
            <div className="flex gap-2">
              <a href={`/api/admin/relatorios/ciclo/${encodeURIComponent(cicloId)}/export?formato=csv`}>
                <Button variant="outline" size="sm">
                  Exportar CSV
                </Button>
              </a>
              <a href={`/api/admin/relatorios/ciclo/${encodeURIComponent(cicloId)}/export?formato=xlsx`}>
                <Button variant="outline" size="sm">
                  Exportar XLSX
                </Button>
              </a>
            </div>
          </div>

          {relatorio.carregando ? (
            <EstadoCarregando />
          ) : relatorio.erro ? (
            <EstadoErro mensagem={relatorio.erro} />
          ) : !relatorio.dados ? (
            <EstadoVazio texto="Sem dados para este ciclo." />
          ) : (
            <div className="space-y-6">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-slate-500">Colaboradores</dt>
                  <dd className="font-medium text-slate-900">{relatorio.dados.resumo.colaboradores}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Extras totais</dt>
                  <dd className="font-medium text-slate-900">{relatorio.dados.resumo.extrasTotais}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Horas totais</dt>
                  <dd className="font-medium text-slate-900">{relatorio.dados.resumo.horasTotais}h</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Vagas não preenchidas</dt>
                  <dd className="font-medium text-slate-900">{relatorio.dados.resumo.vagasNaoPreenchidas}</dd>
                </div>
              </dl>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Por RT</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="p-2">RT</th>
                        <th className="p-2">Vagas</th>
                        <th className="p-2">Ocupação</th>
                        <th className="p-2">Déficits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatorio.dados.porRt.map((linha) => (
                        <tr key={linha.rt} className="border-b border-slate-100">
                          <td className="p-2">{linha.rt}</td>
                          <td className="p-2">
                            {linha.vagasPreenchidas}/{linha.vagasOfertadas}
                          </td>
                          <td className="p-2">{Math.round(linha.taxaOcupacao * 100)}%</td>
                          <td className="p-2">{linha.deficits}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Por colaborador</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="p-2">Nome</th>
                        <th className="p-2">RT</th>
                        <th className="p-2">Base</th>
                        <th className="p-2">Extras</th>
                        <th className="p-2">Cruzadas</th>
                        <th className="p-2">Horas</th>
                        <th className="p-2">Aproveitamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatorio.dados.porColaborador.map((linha) => (
                        <tr key={linha.id} className="border-b border-slate-100">
                          <td className="p-2">
                            {linha.nome} <span className="text-slate-400">#{linha.matricula}</span>
                          </td>
                          <td className="p-2">{linha.rt}</td>
                          <td className="p-2">{linha.plantoesBase}</td>
                          <td className="p-2">{linha.extras}</td>
                          <td className="p-2">{linha.extrasCruzadas}</td>
                          <td className="p-2">{linha.horasBase + linha.horasExtras}h</td>
                          <td className="p-2">{Math.round(linha.aproveitamento * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
