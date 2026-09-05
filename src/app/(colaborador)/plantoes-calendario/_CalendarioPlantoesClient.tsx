'use client';

/**
 * `<CalendarioPlantoesClient />` — abordagem exploratória (calendário) para
 * marcar extras, pedida ao lado da grade original (`/plantoes`). Mesma API
 * (`GET /api/plantoes`, `POST /api/marcacoes`), mesmo hook de realtime
 * (`usePlantoesRealtime`) e o mesmo contrato de disponibilidade
 * (`disponivel`/`motivo`/`jaMarcado` decididos só pela API — FE-001.5):
 * este componente não recalcula vaga, cruzada, jornada ou limite, só agrupa
 * os plantões que a API já retornou por dia do ciclo.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, RefreshCw, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { get, post, type ErroApi } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { TextoComDica } from '@/components/ui/tooltip';
import { SaldoExtras, type SaldoExtrasDados } from '@/components/extras/SaldoExtras';
import { usePlantoesRealtime, type EstadoConexaoRealtime } from '@/hooks/usePlantoesRealtime';
import type { GradePlantoesDados, PlantaoGrade, MotivoIndisponivel } from '@/components/plantoes/GradePlantoes';

const TEXTO_CONEXAO: Record<EstadoConexaoRealtime, { texto: string; ponto: string }> = {
  CONECTANDO: { texto: 'Conectando…', ponto: 'bg-slate-300' },
  CONECTADO: { texto: 'Atualizando ao vivo', ponto: 'bg-emerald-500' },
  RECONECTANDO: { texto: 'Reconectando…', ponto: 'bg-amber-500' },
  DEGRADADO: { texto: 'Modo lento (atualiza a cada 15s)', ponto: 'bg-red-500' },
};

const TEXTO_MOTIVO: Record<MotivoIndisponivel, string> = {
  JA_MARCADO: 'Você já marcou este plantão.',
  CRUZADA_BLOQUEADA: 'Você tem plantão base em outra RT bloqueada para cruzada.',
  EM_AUSENCIA: 'Você está de ausência neste dia.',
  CONFLITO_DE_HORARIO: 'Este horário conflita com seu plantão ou outra extra já marcada.',
  EXCEDE_JORNADA: 'Marcar esta extra excederia sua jornada máxima seguida.',
  LIMITE_ATINGIDO: 'Você atingiu seu limite de extras neste ciclo.',
  SEM_VAGA: 'Não há mais vagas disponíveis para este plantão.',
};

/**
 * Mesma regra de `<GradePlantoes />` (produto, registrada em `_conflitos.md`):
 * plantão de outra RT com cruzada bloqueada pelo admin, e plantão em
 * conflito de horário com o próprio plantão/extra do colaborador, não
 * aparecem em lugar nenhum da tela — nem grade, nem calendário. A API
 * (`disponivel`/`motivo` — FE-001.5) já decide isso; aqui só se filtra a
 * apresentação, nunca se recalcula a regra.
 */
const MOTIVOS_OCULTOS = new Set<MotivoIndisponivel>(['CRUZADA_BLOQUEADA', 'CONFLITO_DE_HORARIO']);

const NOMES_DIA_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

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

export interface CalendarioPlantoesClientProps {
  cicloId: string;
  ano: number;
  mes: number;
  dadosIniciais?: GradePlantoesDados;
  saldoInicial?: SaldoExtrasDados;
}

export function CalendarioPlantoesClient({
  cicloId,
  ano,
  mes,
  dadosIniciais,
  saldoInicial,
}: CalendarioPlantoesClientProps): JSX.Element {
  const [dados, setDados] = useState<GradePlantoesDados | null>(dadosIniciais ?? null);
  const [carregando, setCarregando] = useState(dadosIniciais === undefined);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [erroPorPlantao, setErroPorPlantao] = useState<Record<string, string>>({});
  const [emAndamento, setEmAndamento] = useState<Record<string, boolean>>({});
  const [saldoRevalidar, setSaldoRevalidar] = useState(0);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [atualizandoManual, setAtualizandoManual] = useState(false);

  const dadosRef = useRef(dados);
  dadosRef.current = dados;

  async function buscar(): Promise<void> {
    const primeiraCarga = dadosRef.current === null;
    if (primeiraCarga) setCarregando(true);
    setErroCarga(null);
    const resultado = await get<GradePlantoesDados>(`/api/plantoes?cicloId=${encodeURIComponent(cicloId)}`);
    if (resultado.ok) {
      setDados(resultado.dados);
    } else if (primeiraCarga) {
      setErroCarga(resultado.erro.mensagem);
    }
    if (primeiraCarga) setCarregando(false);
  }

  // A carga inicial normalmente vem pronta do servidor (`dadosIniciais`); se
  // ela faltar (ex.: a chamada no servidor falhou), busca uma vez ao montar
  // — mesma lacuna que `<GradePlantoes />` já cobre com `primeiraRenderizacao`.
  const primeiraRenderizacao = useRef(true);
  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      if (dadosIniciais !== undefined) return;
    }
    void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cicloId]);

  const { estadoConexao } = usePlantoesRealtime(cicloId, () => void buscar());

  async function atualizarManualmente(): Promise<void> {
    setAtualizandoManual(true);
    await buscar();
    setAtualizandoManual(false);
  }

  const disponiveis = useMemo(() => {
    const lista = dados?.plantoes ?? [];
    return lista.filter((p) => p.motivo === null || !MOTIVOS_OCULTOS.has(p.motivo));
  }, [dados]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, PlantaoGrade[]>();
    for (const plantao of disponiveis) {
      const lista = mapa.get(plantao.data) ?? [];
      lista.push(plantao);
      mapa.set(plantao.data, lista);
    }
    return mapa;
  }, [disponiveis]);

  const celulas = useMemo(() => montarGrade(ano, mes), [ano, mes]);

  const diaAtivo = diaSelecionado ?? celulas.find((c) => c.data && (porDia.get(c.data)?.length ?? 0) > 0)?.data ?? null;
  const plantoesDoDia = diaAtivo ? porDia.get(diaAtivo) ?? [] : [];

  async function marcar(plantao: PlantaoGrade): Promise<void> {
    setEmAndamento((atual) => ({ ...atual, [plantao.id]: true }));
    setErroPorPlantao((atual) => ({ ...atual, [plantao.id]: '' }));
    const resultado = await post<{ id: string; plantaoId: string }>(
      '/api/marcacoes',
      { plantaoId: plantao.id },
      { idempotencyKey: `marcar-calendario-${plantao.id}` },
    );
    setEmAndamento((atual) => ({ ...atual, [plantao.id]: false }));
    if (resultado.ok) {
      await buscar();
      setSaldoRevalidar((atual) => atual + 1);
    } else {
      registrarErroInline(plantao.id, resultado.erro);
    }
  }

  function registrarErroInline(plantaoId: string, erro: ErroApi): void {
    setErroPorPlantao((atual) => ({ ...atual, [plantaoId]: erro.mensagem }));
  }

  if (carregando && !dados) {
    return (
      <div role="status" aria-live="polite" className="rounded-lg border border-slate-200 bg-white p-4">
        Carregando calendário de plantões…
      </div>
    );
  }

  if (erroCarga) {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
        {erroCarga}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SaldoExtras cicloId={cicloId} revalidarChave={saldoRevalidar} {...(saldoInicial ? { saldo: saldoInicial } : {})} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" />
              {NOMES_MES[mes - 1]} {ano}
            </div>
            {/* Ciclo mensal fixo (a página busca o ciclo atual) — sem navegação de mês por enquanto. */}
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-500" role="status" aria-live="polite">
                <span className={cn('h-1.5 w-1.5 rounded-full', TEXTO_CONEXAO[estadoConexao].ponto)} />
                {TEXTO_CONEXAO[estadoConexao].texto}
              </span>
              <button
                type="button"
                onClick={() => void atualizarManualmente()}
                disabled={atualizandoManual}
                aria-busy={atualizandoManual}
                title="Atualizar agora"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50"
              >
                <RefreshCw className={cn('h-4 w-4', atualizandoManual && 'animate-spin')} aria-hidden="true" />
              </button>
              <div className="hidden gap-1 text-slate-300 sm:flex">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
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

              const plantoesNoDia = porDia.get(celula.data) ?? [];
              const disponiveis = plantoesNoDia.filter((p) => p.disponivel).length;
              const temMarcado = plantoesNoDia.some((p) => p.jaMarcado);
              const ativo = celula.data === diaAtivo;

              return (
                <button
                  key={celula.data}
                  type="button"
                  onClick={() => setDiaSelecionado(celula.data)}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900',
                    ativo
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : plantoesNoDia.length > 0
                        ? 'border-emerald-200 bg-emerald-50 text-slate-900 hover:border-slate-400'
                        : 'border-slate-100 text-slate-400 hover:border-slate-300',
                  )}
                >
                  <span className="font-semibold">{celula.dia}</span>
                  {plantoesNoDia.length > 0 ? (
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        ativo ? 'bg-white' : temMarcado ? 'bg-blue-500' : disponiveis > 0 ? 'bg-emerald-500' : 'bg-slate-300',
                      )}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> disponível
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> já marcado
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" /> sem vaga/indisponível
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            {diaAtivo ? `Plantões em ${diaAtivo.split('-').reverse().join('/')}` : 'Selecione um dia'}
          </h2>

          {plantoesDoDia.length === 0 ? (
            <p role="status" className="mt-3 text-sm text-slate-500">
              Nenhum plantão de extra neste dia.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {plantoesDoDia.map((plantao) => (
                <li
                  key={plantao.id}
                  data-testid={`plantao-calendario-${plantao.id}`}
                  className={cn(
                    'rounded-lg border p-3 text-sm',
                    plantao.jaMarcado
                      ? 'border-blue-200 bg-blue-50'
                      : plantao.disponivel
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-200 bg-slate-50 opacity-70',
                  )}
                >
                  <div className="flex items-center justify-between font-medium text-slate-900">
                    <span>{plantao.rt}</span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      {plantao.tipo === 'DIURNO' ? (
                        <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {plantao.tipo === 'DIURNO' ? 'Diurno' : 'Noturno'}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-slate-600">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {plantao.horaInicio}–{plantao.horaFim} · {plantao.vagasOcupadas}/{plantao.vagasTotais} vagas
                  </p>

                  <div className="mt-2">
                    {plantao.jaMarcado ? (
                      <Button variant="outline" size="sm" disabled aria-disabled="true">
                        Já marcado
                      </Button>
                    ) : plantao.disponivel ? (
                      <Button
                        size="sm"
                        onClick={() => void marcar(plantao)}
                        disabled={emAndamento[plantao.id] ?? false}
                        aria-busy={emAndamento[plantao.id] ?? false}
                      >
                        {emAndamento[plantao.id] ? 'Marcando…' : 'Marcar extra'}
                      </Button>
                    ) : (
                      <TextoComDica
                        texto={
                          <Button size="sm" variant="outline" disabled aria-disabled="true">
                            {plantao.motivo === 'SEM_VAGA' ? 'Sem vaga' : 'Indisponível'}
                          </Button>
                        }
                        dica={plantao.motivo ? TEXTO_MOTIVO[plantao.motivo] : 'Indisponível.'}
                      />
                    )}
                  </div>

                  {erroPorPlantao[plantao.id] ? (
                    <p role="status" className="mt-2 text-red-700">
                      {erroPorPlantao[plantao.id]}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
