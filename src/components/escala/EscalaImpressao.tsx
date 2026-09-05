'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { letraDiaSemana } from '@/lib/escala/ancora';

export interface CelulaImpressao {
  codigo: string;
  temExtra: boolean;
  /** Turno do PLANTÃO da extra (pode divergir do turno base do colaborador) — mesmo campo de `GradeEscala`/`grade.ts`. */
  extraTurno?: 'DIURNO' | 'NOTURNO';
  /** RT do PLANTÃO da extra (pode divergir da RT do colaborador) — mesmo campo de `GradeEscala`/`grade.ts`. */
  extraRt?: string;
}

export interface ExtraColaboradorImpressao {
  dia: number;
  turno: 'DIURNO' | 'NOTURNO';
  /** RT do plantão coberto — pode divergir da RT do colaborador (cruzada). */
  rt: string;
}

export interface ColaboradorImpressao {
  id: string;
  nome: string;
  matricula: string;
  rt: string;
  turnoPadrao: 'DIURNO' | 'NOTURNO';
  /** Calculada em `src/server/services/escala-admin/grade.ts` — mesma fonte de `<GradeEscala />`. */
  paridade: 'IMPAR' | 'PAR';
  dias: Record<number, CelulaImpressao>;
  /** Extras confirmadas — fonte independente de `dias` (ver `ColaboradorGrade.extras` em `GradeEscala.tsx`). */
  extras: ExtraColaboradorImpressao[];
}

export interface CodigoImpressao {
  codigo: string;
  descricao: string;
  cor: string;
}

export interface EscalaImpressaoDados {
  ciclo: { ano: number; mes: number; dias: number; competencia: string };
  colaboradores: ColaboradorImpressao[];
  codigos: CodigoImpressao[];
}

type GrupoBase = 'IMPAR_DIURNO' | 'IMPAR_NOTURNO' | 'PAR_DIURNO' | 'PAR_NOTURNO';

const ORDEM_GRUPOS_BASE: Array<{ chave: GrupoBase; titulo: string }> = [
  { chave: 'IMPAR_DIURNO', titulo: 'Ímpar Diurno' },
  { chave: 'IMPAR_NOTURNO', titulo: 'Ímpar Noturno' },
  { chave: 'PAR_DIURNO', titulo: 'Par Diurno' },
  { chave: 'PAR_NOTURNO', titulo: 'Par Noturno' },
];

/** Uma linha da tabela de extras — mesmo colaborador pode cobrir mais de um dia no mês, daí `dias` ser um conjunto. */
interface LinhaExtra {
  colaboradorId: string;
  nome: string;
  matricula: string;
  dias: Set<number>;
}

interface GrupoRt {
  rt: string;
  base: Record<GrupoBase, ColaboradorImpressao[]>;
  extrasDiurno: LinhaExtra[];
  extrasNoturno: LinhaExtra[];
}

function agruparPorRt(colaboradores: ColaboradorImpressao[]): GrupoRt[] {
  const porRt = new Map<string, ColaboradorImpressao[]>();
  for (const colaborador of colaboradores) {
    const lista = porRt.get(colaborador.rt) ?? [];
    lista.push(colaborador);
    porRt.set(colaborador.rt, lista);
  }

  // Extras são atribuídas à RT do PLANTÃO coberto (`extraRt`), não à RT de
  // origem do colaborador — passe global, igual `<GradeEscala />`.
  const extrasPorRt = new Map<string, { extrasDiurno: Map<string, LinhaExtra>; extrasNoturno: Map<string, LinhaExtra> }>();
  for (const colaborador of colaboradores) {
    for (const extra of colaborador.extras) {
      const rtDaExtra = extra.rt ?? colaborador.rt;
      const bucket = extrasPorRt.get(rtDaExtra) ?? { extrasDiurno: new Map(), extrasNoturno: new Map() };
      const mapaDoTurno = extra.turno === 'DIURNO' ? bucket.extrasDiurno : bucket.extrasNoturno;
      const linha = mapaDoTurno.get(colaborador.id) ?? { colaboradorId: colaborador.id, nome: colaborador.nome, matricula: colaborador.matricula, dias: new Set<number>() };
      linha.dias.add(extra.dia);
      mapaDoTurno.set(colaborador.id, linha);
      extrasPorRt.set(rtDaExtra, bucket);
    }
  }
  for (const rt of [...extrasPorRt.keys()]) {
    if (!porRt.has(rt)) porRt.set(rt, []);
  }

  return [...porRt.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([rt, lista]) => {
      const base: Record<GrupoBase, ColaboradorImpressao[]> = {
        IMPAR_DIURNO: [],
        IMPAR_NOTURNO: [],
        PAR_DIURNO: [],
        PAR_NOTURNO: [],
      };
      for (const colaborador of lista) {
        base[`${colaborador.paridade}_${colaborador.turnoPadrao}` as GrupoBase].push(colaborador);
      }

      const bucket = extrasPorRt.get(rt);
      const ordenar = (mapa?: Map<string, LinhaExtra>) => [...(mapa?.values() ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

      return { rt, base, extrasDiurno: ordenar(bucket?.extrasDiurno), extrasNoturno: ordenar(bucket?.extrasNoturno) };
    });
}

// A4 paisagem, margem de 12mm (`@page` abaixo) — área útil aproximada a
// 96dpi: (297-24)mm × (210-24)mm ≈ 1032×703px. Usado só pra calcular o fator
// de escala do conteúdo de CADA PÁGINA (uma por RT) antes de imprimir; não
// depende da resolução real da impressora (`transform: scale` opera em
// espaço de px de CSS).
const LARGURA_UTIL_PX = 1032;
const ALTURA_UTIL_PX = 703;
const ESCALA_MINIMA = 0.35;

/**
 * Coluna "Colaborador" fixa em 14% da largura da tabela; o resto se reparte
 * igualmente entre os dias do mês — MESMA proporção em toda tabela da
 * página (base + extras), então as colunas de dia ficam alinhadas entre as
 * tabelas empilhadas de uma RT (pedido do usuário: "todas as colunas terem
 * o mesmo tamanho, para evitar disparidade na impressão"). Percentual (não
 * px fixo, diferente de `<GradeEscala />`) porque aqui a tabela precisa
 * caber exatamente na largura útil da folha A4, que é fixa — `diasDoMes` é o
 * mesmo array (mesmo `.length`) em toda tabela de um mesmo print job, então
 * o percentual por dia sai idêntico em todas.
 */
const LARGURA_COL_COLABORADOR_PCT = 14;

function larguraColDiaPct(totalDias: number): number {
  return (100 - LARGURA_COL_COLABORADOR_PCT) / totalDias;
}

/**
 * `<EscalaImpressao />` — FE-002.
 *
 * A4 paisagem (`API-ADM-ESC-004`), **uma página por RT** (`break-after:
 * page` no `@media print`, confirmado com o usuário — cada RT sai numa
 * folha própria, nunca todas juntas numa única A4). Dentro de cada página,
 * o conteúdo é ajustado pra caber inteiro nessa folha: mede a altura/largura
 * real da seção e aplica `transform: scale()` — melhor esforço, nunca
 * aumenta (`Math.min(1, ...)`) e não deixa a fonte menor que
 * `ESCALA_MINIMA` (abaixo disso deixa de ser legível; nesse caso extremo a
 * RT com volume muito grande de colaboradores ainda pode extravasar pra uma
 * segunda folha).
 *
 * Agrupamento (pedido do usuário, mesmo de `<GradeEscala />`): dentro de
 * cada RT, Ímpar Diurno → Ímpar Noturno → Par Diurno → Par Noturno → Extras
 * Diurno → Extras Noturno. Legenda e rodapé aparecem em toda página — cada
 * folha impressa fica autossuficiente pra quem só recebeu aquela RT.
 *
 * `observacao` é confidencial (`SEC-CONF`) e por isso **nunca** faz parte do
 * tipo `CelulaImpressao` — não há campo para renderizar por engano, mesmo
 * que a API de origem devolva a grade completa e alguém esqueça de filtrar
 * antes de passar os dados para este componente.
 */
export interface EscalaImpressaoProps {
  dados: EscalaImpressaoDados;
  cicloId: string;
  geradoEm: Date;
}

export function EscalaImpressao({ dados, cicloId, geradoEm }: EscalaImpressaoProps): JSX.Element {
  const diasDoMes = Array.from({ length: dados.ciclo.dias }, (_valor, indice) => indice + 1);
  const letrasDoMes = diasDoMes.map((dia) => letraDiaSemana(dados.ciclo.ano, dados.ciclo.mes, dia));
  const grupos = agruparPorRt(dados.colaboradores);
  const dataGeracao = geradoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const paginasRef = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    function ajustarEscalas(): void {
      for (const pagina of paginasRef.current.values()) {
        pagina.style.transform = 'none';
        const fator = Math.max(ESCALA_MINIMA, Math.min(1, LARGURA_UTIL_PX / pagina.scrollWidth, ALTURA_UTIL_PX / pagina.scrollHeight));
        pagina.style.transform = `scale(${fator})`;
        pagina.style.transformOrigin = 'top left';
      }
    }

    window.addEventListener('beforeprint', ajustarEscalas);
    return () => window.removeEventListener('beforeprint', ajustarEscalas);
  }, [dados]);

  return (
    <div className="escala-impressao print:block" data-testid="escala-impressao">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .escala-impressao .rt-pagina { break-after: page; }
          .escala-impressao .rt-pagina:last-child { break-after: auto; }
          @page { size: A4 landscape; margin: 12mm; }
        }
      `}</style>

      {grupos.map(({ rt, base, extrasDiurno, extrasNoturno }) => (
        <section
          key={rt}
          ref={(el) => {
            if (el) paginasRef.current.set(rt, el);
            else paginasRef.current.delete(rt);
          }}
          className="rt-pagina"
          data-testid={`pagina-rt-${rt}`}
          aria-label={`Escala da RT ${rt}`}
        >
          <header className="mb-2 flex items-baseline justify-between border-b border-slate-300 pb-2">
            <h2 className="text-base font-bold">RT {rt}</h2>
            <p className="text-sm">Competência: {dados.ciclo.competencia}</p>
          </header>

          {ORDEM_GRUPOS_BASE.map(({ chave, titulo }) => {
            const colaboradores = base[chave];
            if (colaboradores.length === 0) return null;
            return (
              <div key={chave} className="mb-2">
                <h3 className="text-[11px] font-semibold text-slate-700">{titulo}</h3>
                <table className="w-full table-fixed border-collapse text-[10px]">
                  <colgroup>
                    <col style={{ width: `${LARGURA_COL_COLABORADOR_PCT}%` }} />
                    {diasDoMes.map((dia) => (
                      <col key={dia} style={{ width: `${larguraColDiaPct(diasDoMes.length)}%` }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th rowSpan={2} className="border border-slate-300 p-1 text-left align-bottom">
                        Colaborador
                      </th>
                      {diasDoMes.map((dia, indice) => (
                        <th key={dia} className="border border-slate-300 border-b-0 p-0.5 text-center text-[8px] font-normal text-slate-500">
                          {letrasDoMes[indice]}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {diasDoMes.map((dia) => (
                        <th key={dia} className="border border-slate-300 p-1">
                          {dia}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {colaboradores.map((colaborador) => (
                      <tr key={colaborador.id}>
                        <td className="border border-slate-300 p-1 text-left">
                          {colaborador.nome} (#{colaborador.matricula})
                        </td>
                        {diasDoMes.map((dia) => {
                          const celula = colaborador.dias[dia];
                          return (
                            <td key={dia} className={cn('border border-slate-300 p-1 text-center', celula?.temExtra && 'font-bold')}>
                              {celula?.codigo ?? ''}
                              {celula?.temExtra ? 'E' : ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          <TabelaExtrasImpressao titulo="Extras Diurno" linhas={extrasDiurno} diasDoMes={diasDoMes} letrasDoMes={letrasDoMes} />
          <TabelaExtrasImpressao titulo="Extras Noturno" linhas={extrasNoturno} diasDoMes={diasDoMes} letrasDoMes={letrasDoMes} />

          <footer className="mt-3 flex items-center justify-between border-t border-slate-300 pt-2 text-[9px] text-slate-600">
            <p>
              Legenda:{' '}
              {dados.codigos.map((codigo, indice) => (
                <span key={codigo.codigo}>
                  {indice > 0 ? ' · ' : ''}
                  <strong>{codigo.codigo}</strong> = {codigo.descricao}
                </span>
              ))}
              {' · '}
              <strong>E</strong> = extra confirmada
            </p>
            <p>
              Gerado em {dataGeracao} · Ciclo {cicloId}
            </p>
          </footer>
        </section>
      ))}
    </div>
  );
}

/** Extras em forma de tabela colaboradores × dias — mesmo formato dos plantões comuns (pedido do usuário). */
function TabelaExtrasImpressao({
  titulo,
  linhas,
  diasDoMes,
  letrasDoMes,
}: {
  titulo: string;
  linhas: LinhaExtra[];
  diasDoMes: number[];
  letrasDoMes: string[];
}): JSX.Element | null {
  if (linhas.length === 0) return null;
  return (
    <div className="mb-2">
      <h3 className="text-[11px] font-semibold text-slate-700">{titulo}</h3>
      <table className="w-full table-fixed border-collapse text-[10px]">
        <colgroup>
          <col style={{ width: `${LARGURA_COL_COLABORADOR_PCT}%` }} />
          {diasDoMes.map((dia) => (
            <col key={dia} style={{ width: `${larguraColDiaPct(diasDoMes.length)}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} className="border border-slate-300 p-1 text-left align-bottom">
              Colaborador
            </th>
            {diasDoMes.map((dia, indice) => (
              <th key={dia} className="border border-slate-300 border-b-0 p-0.5 text-center text-[8px] font-normal text-slate-500">
                {letrasDoMes[indice]}
              </th>
            ))}
          </tr>
          <tr>
            {diasDoMes.map((dia) => (
              <th key={dia} className="border border-slate-300 p-1">
                {dia}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.colaboradorId}>
              <td className="border border-slate-300 p-1 text-left">
                {linha.nome} (#{linha.matricula})
              </td>
              {diasDoMes.map((dia) => (
                <td key={dia} className="border border-slate-300 p-1 text-center font-bold">
                  {linha.dias.has(dia) ? 'E' : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
