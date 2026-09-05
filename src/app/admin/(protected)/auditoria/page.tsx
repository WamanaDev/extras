'use client';

import { useMemo, useState } from 'react';
import { useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';

interface EventoAuditoria {
  id: string;
  criadoEm: string;
  atorTipo: string;
  atorId: string | null;
  atorNome: string | null;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  payload: unknown;
  integridade: 'OK' | 'QUEBRADA';
}

interface RespostaAuditoria {
  eventos: EventoAuditoria[];
}

/** `/admin/auditoria` — FE-001, API-ADM-REL-003. */
export default function AuditoriaPage(): JSX.Element {
  const [entidade, setEntidade] = useState('');
  const [acao, setAcao] = useState('');

  const caminho = useMemo(() => {
    const params = new URLSearchParams({ tamanho: '100' });
    if (entidade.trim()) params.set('entidade', entidade.trim());
    if (acao.trim()) params.set('acao', acao.trim());
    return `/api/admin/auditoria?${params.toString()}`;
  }, [entidade, acao]);

  const auditoria = useRecursoApi<RespostaAuditoria>(caminho);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Trilha de auditoria</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col text-sm">
            Entidade
            <input value={entidade} onChange={(evento) => setEntidade(evento.target.value)} className="rounded border border-slate-300 p-2" placeholder="ciclo, colaborador…" />
          </label>
          <label className="flex flex-col text-sm">
            Ação
            <input value={acao} onChange={(evento) => setAcao(evento.target.value)} className="rounded border border-slate-300 p-2" placeholder="CICLO_PUBLICADO…" />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        {auditoria.carregando ? (
          <EstadoCarregando />
        ) : auditoria.erro ? (
          <EstadoErro mensagem={auditoria.erro} />
        ) : !auditoria.dados || auditoria.dados.eventos.length === 0 ? (
          <EstadoVazio texto="Nenhum evento encontrado para este filtro." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="p-2">Quando</th>
                  <th className="p-2">Ator</th>
                  <th className="p-2">Ação</th>
                  <th className="p-2">Entidade</th>
                  <th className="p-2">Integridade</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.dados.eventos.map((evento) => (
                  <tr key={evento.id} className="border-b border-slate-100 align-top">
                    <td className="p-2 whitespace-nowrap">{new Date(evento.criadoEm).toLocaleString('pt-BR')}</td>
                    <td className="p-2">
                      {evento.atorTipo}
                      {evento.atorNome ? ` · ${evento.atorNome}` : ''}
                    </td>
                    <td className="p-2">{evento.acao}</td>
                    <td className="p-2">
                      {evento.entidade}
                      {evento.entidadeId ? ` #${evento.entidadeId.slice(0, 8)}` : ''}
                    </td>
                    <td className="p-2">
                      <Badge variant={evento.integridade === 'OK' ? 'success' : 'destructive'}>{evento.integridade}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
