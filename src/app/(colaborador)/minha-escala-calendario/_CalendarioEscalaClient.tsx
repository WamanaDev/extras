'use client';

/**
 * `<CalendarioEscalaClient />` — abordagem exploratória (calendário) para
 * visualizar a escala, ao lado da tabela original (`/minha-escala`). Mesma
 * API (`GET /api/minha-escala`, `GET /api/minhas-marcacoes`) e os mesmos
 * campos que `minha-escala/page.tsx` já expõe — este componente não
 * recalcula presença, horário ou extra, só agrupa por dia do ciclo os dados
 * que o servidor já buscou e passou prontos via props.
 *
 * Diferente de `<CalendarioPlantoesClient />`: aqui os dados não mudam em
 * tempo real (a escala é estável dentro do ciclo), então não há
 * `usePlantoesRealtime` nem botão de atualização manual — só apresentação.
 */
import { useMemo, useState } from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const NOMES_DIA_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export interface DiaEscala {
  data: string;
  turno: 'DIURNO' | 'NOTURNO';
  codigo: string;
  descricaoCodigo: string;
  presenca: boolean;
  horaInicio: string | null;
  horaFim: string | null;
  extra?: { plantaoId: string; rt: string; tipo: 'DIURNO' | 'NOTURNO'; horaInicio: string; horaFim: string };
}

export interface MinhaEscala {
  ciclo: { ano: number; mes: number };
  dias: DiaEscala[];
  totais: { escalados: number; extras: number; horas: number };
}

export interface MarcacaoHistorico {
  id: string;
  data: string;
  tipo: 'DIURNO' | 'NOTURNO';
  rt: string;
  horaInicio: string;
  horaFim: string;
  status: 'CONFIRMADA' | 'CANCELADA';
  cruzada: boolean;
}

export interface MinhasMarcacoesResposta {
  marcacoes: MarcacaoHistorico[];
  totais: { confirmadas: number; canceladas: number; horas: number };
}

interface CelulaCalendario {
  data: string | null; // 'YYYY-MM-DD', null = célula fora do mês do ciclo
  dia: number | null;
}

function montarGrade(ano: number, mes: number): CelulaCalendario[] {
  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay(); // 0=Dom
  const offset = (primeiroDiaSemana + 6) % 7; // Segunda = 0
  const totalDias = new Date(ano, mes, 0).getDate();

  const celulas: CelulaCalendario[] = [];
  for (let i = 0; i < offset; i++) celulas.push({ data: null, dia: null });
  for (let dia = 1; dia <= totalDias; dia++) {
    const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    celulas.push({ data, dia });
  }
  while (celulas.length % 7 !== 0) celulas.push({ data: null, dia: null });
  return celulas;
}

/**
 * Categoria só de apresentação (cor da célula) — não é regra de negócio nova,
 * apenas uma leitura dos campos que a API já decidiu (`presenca`, `extra`).
 *
 * `dia.extra` (de `/api/minha-escala`) só existe quando o colaborador TAMBÉM
 * tem uma linha de `escala_dia` naquele dia (o `LEFT JOIN LATERAL` da extra
 * depende de uma linha base pra se pendurar — ver `buscarMinhaEscala`,
 * `src/server/services/colaborador/minha-escala.ts`). Numa folga sem linha
 * de escala própria, esse dia nem aparece no array `dias` — só
 * `/api/minhas-marcacoes` sabe da extra. Por isso `temExtraConfirmada`
 * (calculado à parte, a partir de `marcacoes`) é checado primeiro aqui: o
 * calendário não pode "esquecer" um dia só porque ele não tem escala base,
 * já que o grid é desenhado pra todo dia do mês, tenha ou não `escala_dia`.
 */
type CategoriaDia = 'TRABALHADO' | 'FOLGA' | 'EXTRA';

function categoriaDoDia(dia: DiaEscala | undefined, temExtraConfirmada: boolean): CategoriaDia | null {
  if (temExtraConfirmada || dia?.extra) return 'EXTRA';
  if (!dia) return null;
  if (dia.presenca) return 'TRABALHADO';
  return 'FOLGA';
}

const ESTILO_CELULA: Record<CategoriaDia, { ativo: string; padrao: string; ponto: string }> = {
  TRABALHADO: {
    ativo: 'border-petrol-600 bg-petrol-600 text-white',
    padrao: 'border-blue-200 bg-blue-50 text-slate-900 hover:border-slate-400',
    ponto: 'bg-blue-500',
  },
  EXTRA: {
    ativo: 'border-petrol-600 bg-petrol-600 text-white',
    padrao: 'border-amber-200 bg-amber-50 text-slate-900 hover:border-slate-400',
    ponto: 'bg-amber-500',
  },
  FOLGA: {
    ativo: 'border-petrol-600 bg-petrol-600 text-white',
    padrao: 'border-slate-100 text-slate-400 hover:border-slate-300',
    ponto: 'bg-slate-300',
  },
};

export interface CalendarioEscalaClientProps {
  ano: number;
  mes: number;
  escala: MinhaEscala;
  marcacoes?: MinhasMarcacoesResposta;
}

export function CalendarioEscalaClient({ ano, mes, escala, marcacoes }: CalendarioEscalaClientProps): JSX.Element {
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);

  const porDia = useMemo(() => {
    const mapa = new Map<string, DiaEscala>();
    for (const dia of escala.dias) mapa.set(dia.data, dia);
    return mapa;
  }, [escala.dias]);

  const celulas = useMemo(() => montarGrade(ano, mes), [ano, mes]);

  const extrasConfirmadas = useMemo(
    () => marcacoes?.marcacoes.filter((m) => m.status === 'CONFIRMADA') ?? [],
    [marcacoes],
  );

  // Por data, pra completar dias sem `escala_dia` própria — ver docstring de `categoriaDoDia`.
  const marcacaoPorDia = useMemo(() => {
    const mapa = new Map<string, MarcacaoHistorico>();
    for (const marcacao of extrasConfirmadas) mapa.set(marcacao.data, marcacao);
    return mapa;
  }, [extrasConfirmadas]);

  const diaAtivo = diaSelecionado ?? escala.dias[0]?.data ?? extrasConfirmadas[0]?.data ?? null;
  const detalheDia = diaAtivo ? porDia.get(diaAtivo) ?? null : null;
  const marcacaoDoDiaAtivo = diaAtivo ? marcacaoPorDia.get(diaAtivo) ?? null : null;

  return (
    <div className="space-y-6">
      <dl className="flex flex-wrap gap-4 text-sm text-slate-600">
        <div>
          <dt className="inline font-medium text-slate-900">Escalados: </dt>
          <dd className="inline">{escala.totais.escalados}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-slate-900">Extras: </dt>
          <dd className="inline">{escala.totais.extras}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-slate-900">Horas: </dt>
          <dd className="inline">{escala.totais.horas}h</dd>
        </div>
      </dl>

      {escala.dias.length === 0 ? (
        <div role="status" className="rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
          Sua escala ainda não foi gerada para este ciclo.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" />
              {NOMES_MES[mes - 1]} {ano}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400">
              {NOMES_DIA_SEMANA.map((nome) => (
                <div key={nome} className="py-1">
                  {nome}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {celulas.map((celula, indice) => {
                if (!celula.data) return <div key={`vazia-${indice}`} className="aspect-square" />;

                const dia = porDia.get(celula.data);
                const ativo = celula.data === diaAtivo;
                const categoria = categoriaDoDia(dia, marcacaoPorDia.has(celula.data));
                const estilo = categoria ? ESTILO_CELULA[categoria] : null;

                return (
                  <button
                    key={celula.data}
                    type="button"
                    onClick={() => setDiaSelecionado(celula.data)}
                    className={cn(
                      'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                      ativo ? estilo?.ativo ?? 'border-petrol-600 bg-petrol-600 text-white' : estilo?.padrao ?? 'border-slate-100 text-slate-400',
                    )}
                  >
                    <span className="font-semibold">{celula.dia}</span>
                    {estilo ? (
                      <span className={cn('h-1.5 w-1.5 rounded-full', ativo ? 'bg-white' : estilo.ponto)} />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> trabalhado
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> extra confirmada
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" /> folga/sem presença
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <h2 className="text-sm font-semibold text-slate-900">
              {diaAtivo ? `Detalhe de ${diaAtivo.split('-').reverse().join('/')}` : 'Selecione um dia'}
            </h2>

            {!detalheDia && marcacaoDoDiaAtivo ? (
              // Dia sem `escala_dia` própria (folga sem linha base), mas com
              // extra confirmada — mesmo dado que já aparece em "Minhas
              // extras confirmadas" abaixo, só que no contexto do dia.
              <div className="mt-3 space-y-3 text-sm">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center justify-between font-medium text-slate-900">
                    <span>Extra (dia de folga)</span>
                    <Badge variant="warning">{marcacaoDoDiaAtivo.rt}</Badge>
                  </div>
                  <p className="mt-1 text-slate-600">
                    {marcacaoDoDiaAtivo.tipo === 'DIURNO' ? 'Diurno' : 'Noturno'} · {marcacaoDoDiaAtivo.horaInicio}–
                    {marcacaoDoDiaAtivo.horaFim}
                  </p>
                  {marcacaoDoDiaAtivo.cruzada ? <p className="mt-1 text-xs text-amber-700">Fora da sua RT (cruzada)</p> : null}
                </div>
              </div>
            ) : !detalheDia ? (
              <p role="status" className="mt-3 text-sm text-slate-500">
                Sem dado de escala para este dia.
              </p>
            ) : (
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <Badge variant={detalheDia.presenca ? 'default' : 'secondary'} title={detalheDia.descricaoCodigo}>
                    {detalheDia.codigo}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {detalheDia.turno === 'DIURNO' ? 'Diurno' : 'Noturno'}
                  </span>
                </div>
                <p className="text-slate-600">{detalheDia.descricaoCodigo}</p>
                <p className="flex items-center gap-1 text-slate-600">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {detalheDia.presenca ? 'Presença' : 'Sem presença'}
                  {detalheDia.presenca && detalheDia.horaInicio && detalheDia.horaFim
                    ? ` · ${detalheDia.horaInicio}–${detalheDia.horaFim}`
                    : ''}
                </p>
                {detalheDia.extra ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center justify-between font-medium text-slate-900">
                      <span>Extra</span>
                      <Badge variant="warning">{detalheDia.extra.rt}</Badge>
                    </div>
                    <p className="mt-1 text-slate-600">
                      {detalheDia.extra.tipo === 'DIURNO' ? 'Diurno' : 'Noturno'} · {detalheDia.extra.horaInicio}–{detalheDia.extra.horaFim}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {extrasConfirmadas.length > 0 ? (
        <section>
          <h2 className="text-base font-semibold text-slate-900">Minhas extras confirmadas</h2>
          <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {extrasConfirmadas.map((marcacao) => (
              <li key={marcacao.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                <div className="flex items-center justify-between font-medium text-slate-900">
                  <span>{marcacao.data}</span>
                  <Badge variant="warning">{marcacao.rt}</Badge>
                </div>
                <p className="mt-1 text-slate-600">
                  {marcacao.tipo === 'DIURNO' ? 'Diurno' : 'Noturno'} · {marcacao.horaInicio}–{marcacao.horaFim}
                </p>
                {marcacao.cruzada ? <p className="mt-1 text-xs text-amber-700">Fora da sua RT (cruzada)</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
