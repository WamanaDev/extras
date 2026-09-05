'use client';

import { useMemo, useState } from 'react';
import { useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';

interface ContaBloqueada {
  colaboradorId: string;
  nome: string;
  matricula: string;
  bloqueadoAte: string;
  falhas: number;
}

interface IpSuspeito {
  ip: string;
  tentativas: number;
  matriculasDistintas: number;
  primeiraEm: string;
  ultimaEm: string;
}

interface PainelSeguranca {
  contasBloqueadas: ContaBloqueada[];
  ipsSuspeitos: IpSuspeito[];
  sessoesAtivas: number;
  resumo: { tentativas: number; falhas: number; taxaFalha: number };
}

/** `/admin/seguranca` — FE-001, API-ADM-REL-004. */
export default function SegurancaPage(): JSX.Element {
  const [janela, setJanela] = useState<'24h' | '7d'>('24h');
  const [apenasSuspeitas, setApenasSuspeitas] = useState(false);

  const caminho = useMemo(
    () => `/api/admin/seguranca/tentativas?janela=${janela}&apenasSuspeitas=${apenasSuspeitas ? 'true' : 'false'}`,
    [janela, apenasSuspeitas],
  );
  const painel = useRecursoApi<PainelSeguranca>(caminho);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Segurança</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex flex-col text-sm">
            Janela
            <select value={janela} onChange={(evento) => setJanela(evento.target.value as '24h' | '7d')} className="rounded border border-slate-300 p-2">
              <option value="24h">Últimas 24h</option>
              <option value="7d">Últimos 7 dias</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={apenasSuspeitas} onChange={(evento) => setApenasSuspeitas(evento.target.checked)} />
            Apenas contas ligadas a IPs suspeitos
          </label>
        </div>
      </section>

      {painel.carregando ? (
        <EstadoCarregando texto="Carregando painel de segurança…" />
      ) : painel.erro ? (
        <EstadoErro mensagem={painel.erro} />
      ) : !painel.dados ? (
        <EstadoVazio texto="Sem dados de segurança para o período." />
      ) : (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">Tentativas</dt>
                <dd className="font-medium text-slate-900">{painel.dados.resumo.tentativas}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Falhas</dt>
                <dd className="font-medium text-slate-900">{painel.dados.resumo.falhas}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Taxa de falha</dt>
                <dd className="font-medium text-slate-900">{Math.round(painel.dados.resumo.taxaFalha * 100)}%</dd>
              </div>
              <div>
                <dt className="text-slate-500">Sessões ativas</dt>
                <dd className="font-medium text-slate-900">{painel.dados.sessoesAtivas}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Contas bloqueadas</h2>
            {painel.dados.contasBloqueadas.length === 0 ? (
              <EstadoVazio texto="Nenhuma conta bloqueada no período." />
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {painel.dados.contasBloqueadas.map((conta) => (
                  <li key={conta.colaboradorId} className="flex items-center justify-between py-1.5">
                    <span>
                      {conta.nome} <span className="text-slate-400">#{conta.matricula}</span>
                    </span>
                    <span className="text-slate-600">
                      {conta.falhas} falha(s) · até {new Date(conta.bloqueadoAte).toLocaleString('pt-BR')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">IPs suspeitos</h2>
            {painel.dados.ipsSuspeitos.length === 0 ? (
              <EstadoVazio texto="Nenhum IP suspeito no período." />
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {painel.dados.ipsSuspeitos.map((ip) => (
                  <li key={ip.ip} className="flex items-center justify-between py-1.5">
                    <span>{ip.ip}</span>
                    <span className="flex items-center gap-2 text-slate-600">
                      {ip.tentativas} tentativa(s) · {ip.matriculasDistintas} matrícula(s)
                      <Badge variant="destructive">suspeito</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
