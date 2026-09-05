'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { letraDiaSemana } from '@/lib/escala/ancora';
import { get, patch, type ErroApi } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { ConfirmacaoImpacto } from '@/components/comum/ConfirmacaoImpacto';

export interface CelulaGrade {
  escalaDiaId: string;
  codigo: string;
  turno: 'DIURNO' | 'NOTURNO';
  temExtra: boolean;
  /** Turno do PLANTÃO da extra (pode divergir do turno base do colaborador — extra cruzada de turno). */
  extraTurno?: 'DIURNO' | 'NOTURNO';
  /** RT do PLANTÃO da extra (pode divergir da RT do colaborador — extra cruzada de RT). */
  extraRt?: string;
  observacao?: string;
}

export interface ExtraColaborador {
  dia: number;
  turno: 'DIURNO' | 'NOTURNO';
  /** RT do plantão coberto — pode divergir da RT do colaborador (cruzada). */
  rt: string;
}

export interface ColaboradorGrade {
  id: string;
  nome: string;
  matricula: string;
  rt: string;
  turnoPadrao: 'DIURNO' | 'NOTURNO';
  /** Calculada em `src/server/services/escala-admin/grade.ts` — fonte única, reaproveitada aqui e em `<EscalaImpressao />`/PDF/XLSX. */
  paridade: 'IMPAR' | 'PAR';
  dias: Record<number, CelulaGrade>;
  /**
   * Extras confirmadas do colaborador — fonte independente de `dias`: uma
   * extra normalmente cai no dia de FOLGA do colaborador, dia que pode nem
   * ter célula em `dias` (achado em uso real — extras contavam em `totais`
   * mas não apareciam em lugar nenhum da tela). Usar SEMPRE este campo pra
   * montar "Extras Diurno/Noturno", nunca escanear `dias`.
   */
  extras: ExtraColaborador[];
  totais: { trabalhados: number; folgas: number; extras: number; horas: number };
}

export interface CodigoGrade {
  codigo: string;
  descricao: string;
  cor: string;
  presenca: boolean;
  ocupaHorario: boolean;
}

export interface GradeEscalaDados {
  ciclo: { ano: number; mes: number; dias: number };
  colaboradores: ColaboradorGrade[];
  codigos: CodigoGrade[];
  coberturaPorDia: Record<number, { rt: string; turno: 'DIURNO' | 'NOTURNO'; total: number; minimo: number }>;
}

const LIMIAR_VIRTUALIZACAO = 40;
const ALTURA_LINHA_PX = 32;
const OVERSCAN_LINHAS = 8;

/**
 * Larguras fixas e IDÊNTICAS em toda tabela desta tela (`<Subgrade />` e
 * `<TabelaExtras />`) — pedido do usuário: "todas as escalas serem
 * alinhadas, todas as colunas terem o mesmo tamanho". Sem isso, cada
 * `<table>` (uma por subgrupo Ímpar/Par × Diurno/Noturno + extras) tem
 * `table-layout` automático e ajusta a largura de cada coluna ao próprio
 * conteúdo — a coluna do dia 5 de uma tabela não fica alinhada com a coluna
 * do dia 5 da tabela de baixo, o nome mais comprido de um subgrupo empurra
 * a coluna "Colaborador" só naquela tabela, etc. Fixando a largura (com
 * `table-layout: fixed` nas tabelas) e reaproveitando as MESMAS constantes
 * em toda tabela da página garante alinhamento perfeito entre elas.
 */
const LARGURA_COL_COLABORADOR_PX = 176;
const LARGURA_COL_DIA_PX = 32;
const LARGURA_COL_TOTAIS_PX = 96;

interface ImpactoAlteracao {
  escalaDiaId: string;
  colaboradorId: string;
  dia: number;
  codigoNovo: string;
  itens: string[];
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

/**
 * `<GradeEscala />` — FE-002.
 *
 * Matriz colaboradores × dias 1–31 (`API-ADM-ESC-001 GET
 * /api/admin/ciclos/:id/escala`). Edição inline via dropdown chama
 * `API-ADM-ESC-002 PATCH /api/admin/escala/:id`; um `409
 * IMPACTO_NAO_CONFIRMADO` reabre `<ConfirmacaoImpacto />` e reenvia com
 * `confirmarImpacto: true` — nunca decide sozinho se o impacto é aceitável.
 *
 * Regra de acessibilidade (FE-002/FE-001.7): o texto do código (`D`/`F`/
 * `FT`/`FE`) está **sempre** presente na célula — a cor é reforço visual,
 * nunca o único sinal (impressão monocromática e daltonismo).
 *
 * Agrupamento (pedido do usuário, puramente visual — organização, não regra
 * de negócio): um bloco por RT; dentro de cada RT, na ordem Ímpar Diurno →
 * Ímpar Noturno → Par Diurno → Par Noturno → Extras Diurno → Extras Noturno.
 * Cada subgrupo base é sua própria mini-tabela (`<Subgrade />`), com
 * navegação por teclado e virtualização independentes — like o grupo típico
 * (uma RT × uma paridade × um turno) fica bem abaixo do limiar de 40 linhas
 * que ativava a virtualização na tabela única anterior.
 */
export interface GradeEscalaProps {
  cicloId: string;
  dadosIniciais?: GradeEscalaDados;
  onErro?: (erro: ErroApi) => void;
}

export function GradeEscala({ cicloId, dadosIniciais, onErro }: GradeEscalaProps): JSX.Element {
  const [dados, setDados] = useState<GradeEscalaDados | null>(dadosIniciais ?? null);
  const [carregando, setCarregando] = useState(dadosIniciais === undefined);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [erroPorCelula, setErroPorCelula] = useState<Record<string, string>>({});
  const [impactoPendente, setImpactoPendente] = useState<ImpactoAlteracao | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (dadosIniciais !== undefined) return;
    let cancelado = false;
    setCarregando(true);
    get<GradeEscalaDados>(`/api/admin/ciclos/${encodeURIComponent(cicloId)}/escala`).then((resultado) => {
      if (cancelado) return;
      if (resultado.ok) setDados(resultado.dados);
      else setErroCarga(resultado.erro.mensagem);
      setCarregando(false);
    });
    return () => {
      cancelado = true;
    };
  }, [cicloId, dadosIniciais]);

  async function aplicarAlteracao(
    escalaDiaId: string,
    colaboradorId: string,
    dia: number,
    codigoNovo: string,
    confirmarImpacto: boolean,
  ): Promise<void> {
    const chave = `${colaboradorId}:${dia}`;
    setErroPorCelula((atual) => ({ ...atual, [chave]: '' }));
    const resultado = await patch<{
      escalaDia: { id: string; data: string; codigo: string; observacao: string | null };
      impacto: { extrasAfetadas: Array<{ marcacaoId: string; plantaoId: string }>; coberturaDepois: { deficit: number; rt: string } };
    }>(`/api/admin/escala/${escalaDiaId}`, { codigo: codigoNovo, confirmarImpacto });

    if (resultado.ok) {
      setImpactoPendente(null);
      setDados((atual) => atual && aplicarCodigoNaGrade(atual, colaboradorId, dia, resultado.dados.escalaDia));
      return;
    }

    if (resultado.erro.erro === 'IMPACTO_NAO_CONFIRMADO') {
      // FE-001.6: reabre com o impacto listado — nunca reenvia sozinho.
      setImpactoPendente({
        escalaDiaId,
        colaboradorId,
        dia,
        codigoNovo,
        itens: [resultado.erro.mensagem],
      });
      return;
    }

    // FE-001.4: 409 de regra de negócio é inline, não toast.
    setErroPorCelula((atual) => ({ ...atual, [chave]: resultado.erro.mensagem }));
    onErro?.(resultado.erro);
  }

  const codigosPorCodigo = useMemo(() => new Map((dados?.codigos ?? []).map((c) => [c.codigo, c])), [dados]);

  const gruposPorRt = useMemo(() => {
    if (!dados) return [];
    const porRt = new Map<string, ColaboradorGrade[]>();
    for (const colaborador of dados.colaboradores) {
      const lista = porRt.get(colaborador.rt) ?? [];
      lista.push(colaborador);
      porRt.set(colaborador.rt, lista);
    }

    // Extras são atribuídas à RT do PLANTÃO coberto (`extraRt`), não à RT de
    // origem do colaborador — uma extra cruzada de RT (colaborador de uma RT
    // cobrindo plantão de outra) precisa aparecer na seção da RT coberta.
    // Por isso este é um passe GLOBAL sobre todos os colaboradores, não só
    // os da RT sendo montada no map abaixo.
    const extrasPorRt = new Map<string, { extrasDiurno: Map<string, LinhaExtra>; extrasNoturno: Map<string, LinhaExtra> }>();
    for (const colaborador of dados.colaboradores) {
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
      if (!porRt.has(rt)) porRt.set(rt, []); // RT só aparece via extra cruzada (sem colaborador próprio no ciclo) — ainda precisa da seção.
    }

    return [...porRt.entries()]
      .sort(([rtA], [rtB]) => rtA.localeCompare(rtB, 'pt-BR'))
      .map(([rt, colaboradores]) => {
        const base: Record<GrupoBase, ColaboradorGrade[]> = {
          IMPAR_DIURNO: [],
          IMPAR_NOTURNO: [],
          PAR_DIURNO: [],
          PAR_NOTURNO: [],
        };
        for (const colaborador of colaboradores) {
          base[`${colaborador.paridade}_${colaborador.turnoPadrao}` as GrupoBase].push(colaborador);
        }

        const bucket = extrasPorRt.get(rt);
        const ordenar = (mapa?: Map<string, LinhaExtra>) => [...(mapa?.values() ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        const extrasDiurno = ordenar(bucket?.extrasDiurno);
        const extrasNoturno = ordenar(bucket?.extrasNoturno);

        return { rt, base, extrasDiurno, extrasNoturno };
      });
  }, [dados, codigosPorCodigo]);

  if (carregando && !dados) {
    return (
      <div role="status" aria-live="polite" className="p-4">
        Carregando escala…
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

  if (!dados || dados.colaboradores.length === 0) {
    return (
      <div role="status" className="rounded-lg border border-slate-200 p-4 text-slate-600">
        Nenhum colaborador nesta escala.
      </div>
    );
  }

  const diasDoMes = Array.from({ length: dados.ciclo.dias }, (_valor, indice) => indice + 1);
  const letrasDoMes = diasDoMes.map((dia) => letraDiaSemana(dados.ciclo.ano, dados.ciclo.mes, dia));

  return (
    <div className="space-y-8">
      <p className="text-xs text-slate-600">
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

      {gruposPorRt.map(({ rt, base, extrasDiurno, extrasNoturno }) => (
        <section key={rt} className="space-y-4 rounded-lg border border-slate-300 p-3">
          <h2 className="text-base font-semibold text-slate-900">{rt}</h2>

          {ORDEM_GRUPOS_BASE.map(({ chave, titulo }) => {
            const colaboradores = base[chave];
            if (colaboradores.length === 0) return null;
            return (
              <div key={chave} className="space-y-1">
                <h3 className="text-sm font-medium text-slate-700">{titulo}</h3>
                <Subgrade
                  colaboradores={colaboradores}
                  diasDoMes={diasDoMes}
                  letrasDoMes={letrasDoMes}
                  codigos={dados.codigos}
                  codigosPorCodigo={codigosPorCodigo}
                  coberturaPorDia={dados.coberturaPorDia}
                  erroPorCelula={erroPorCelula}
                  aplicarAlteracao={aplicarAlteracao}
                />
              </div>
            );
          })}

          <TabelaExtras titulo="Extras Diurno" linhas={extrasDiurno} diasDoMes={diasDoMes} letrasDoMes={letrasDoMes} />
          <TabelaExtras titulo="Extras Noturno" linhas={extrasNoturno} diasDoMes={diasDoMes} letrasDoMes={letrasDoMes} />
        </section>
      ))}

      <ConfirmacaoImpacto
        aberto={impactoPendente !== null}
        titulo="Esta alteração afeta extras já marcadas"
        itens={impactoPendente?.itens ?? []}
        carregando={confirmando}
        onCancelar={() => setImpactoPendente(null)}
        onConfirmar={() => {
          if (!impactoPendente) return;
          setConfirmando(true);
          void aplicarAlteracao(
            impactoPendente.escalaDiaId,
            impactoPendente.colaboradorId,
            impactoPendente.dia,
            impactoPendente.codigoNovo,
            true,
          ).finally(() => setConfirmando(false));
        }}
      />
    </div>
  );
}

/**
 * Extras renderizadas como tabela colaboradores × dias — mesmo formato dos
 * plantões comuns (pedido do usuário: "as extras devem ser exibidas da
 * mesma forma que os plantões comuns, em forma de tabela"), não mais uma
 * lista de badges soltas. Só marca "E" no dia em que o colaborador cobriu
 * extra — não editável (a marcação em si é feita em Marcações, `API-ADM-MAR-*`).
 */
function TabelaExtras({
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
    <div className="space-y-1">
      <h3 className="text-sm font-medium text-slate-700">{titulo}</h3>
      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: LARGURA_COL_COLABORADOR_PX }} />
            {diasDoMes.map((dia) => (
              <col key={dia} style={{ width: LARGURA_COL_DIA_PX }} />
            ))}
          </colgroup>
          <thead className="bg-white">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-10 truncate bg-white p-2 text-left align-bottom">
                Colaborador
              </th>
              {diasDoMes.map((dia, indice) => (
                <th key={dia} className="border-b-0 p-1 pb-0 text-center text-[10px] font-normal text-slate-400">
                  {letrasDoMes[indice]}
                </th>
              ))}
            </tr>
            <tr>
              {diasDoMes.map((dia) => (
                <th key={dia} className="border-b border-slate-200 p-1 pt-0 text-center font-medium">
                  {dia}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={linha.colaboradorId} style={{ height: ALTURA_LINHA_PX }}>
                <td className="sticky left-0 z-10 truncate bg-white p-2 font-medium text-slate-900">
                  {linha.nome}
                  <span className="ml-1 text-slate-400">#{linha.matricula}</span>
                </td>
                {diasDoMes.map((dia) => (
                  <td key={dia} className="border border-slate-100 p-0 text-center font-bold text-amber-700">
                    {linha.dias.has(dia) ? 'E' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Uma mini-tabela editável (colaboradores × dias) — mesma lógica de
 * navegação por teclado e virtualização que a grade original tinha,
 * parametrizada por um subconjunto de colaboradores (um grupo Ímpar/Par ×
 * Diurno/Noturno de uma RT). Cada instância tem seu próprio foco/scroll —
 * navegar entre subgrupos com as setas não é suportado (aceitável: cada
 * subgrupo já é pequeno o bastante pra não precisar).
 */
function Subgrade({
  colaboradores,
  diasDoMes,
  letrasDoMes,
  codigos,
  codigosPorCodigo,
  coberturaPorDia,
  erroPorCelula,
  aplicarAlteracao,
}: {
  colaboradores: ColaboradorGrade[];
  diasDoMes: number[];
  letrasDoMes: string[];
  codigos: CodigoGrade[];
  codigosPorCodigo: Map<string, CodigoGrade>;
  coberturaPorDia: GradeEscalaDados['coberturaPorDia'];
  erroPorCelula: Record<string, string>;
  aplicarAlteracao: (escalaDiaId: string, colaboradorId: string, dia: number, codigoNovo: string, confirmarImpacto: boolean) => Promise<void>;
}): JSX.Element {
  const [scrollTop, setScrollTop] = useState(0);
  const [alturaViewport, setAlturaViewport] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);
  const celulasRef = useRef<Map<string, HTMLElement>>(new Map());
  const [foco, setFoco] = useState({ linha: 0, coluna: 0 });

  const totalLinhas = colaboradores.length;
  const virtualizado = totalLinhas >= LIMIAR_VIRTUALIZACAO;

  const janela = useMemo(() => {
    if (!virtualizado) return { inicio: 0, fim: totalLinhas };
    const primeiraVisivel = Math.floor(scrollTop / ALTURA_LINHA_PX);
    const linhasVisiveis = Math.ceil(alturaViewport / ALTURA_LINHA_PX);
    const inicio = Math.max(0, primeiraVisivel - OVERSCAN_LINHAS);
    const fim = Math.min(totalLinhas, primeiraVisivel + linhasVisiveis + OVERSCAN_LINHAS);
    return { inicio, fim };
  }, [virtualizado, scrollTop, alturaViewport, totalLinhas]);

  const onScroll = useCallback(() => {
    if (containerRef.current) setScrollTop(containerRef.current.scrollTop);
  }, []);

  useEffect(() => {
    if (containerRef.current) setAlturaViewport(containerRef.current.clientHeight || 600);
  }, [colaboradores]);

  function moverFoco(delta: { linha?: number; coluna?: number }): void {
    setFoco((atual) => {
      const linha = Math.min(totalLinhas - 1, Math.max(0, atual.linha + (delta.linha ?? 0)));
      const coluna = Math.min(diasDoMes.length - 1, Math.max(0, atual.coluna + (delta.coluna ?? 0)));
      const chave = `${linha}:${coluna}`;
      celulasRef.current.get(chave)?.focus();
      return { linha, coluna };
    });
  }

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className="max-h-[600px] overflow-auto rounded-lg border border-slate-200"
      role="grid"
      aria-rowcount={totalLinhas}
      aria-colcount={diasDoMes.length}
      aria-label="Grade de escala"
    >
      <table className="w-full table-fixed border-collapse text-xs">
        <colgroup>
          <col style={{ width: LARGURA_COL_COLABORADOR_PX }} />
          {diasDoMes.map((dia) => (
            <col key={dia} style={{ width: LARGURA_COL_DIA_PX }} />
          ))}
          <col style={{ width: LARGURA_COL_TOTAIS_PX }} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-white">
          <tr>
            <th rowSpan={2} className="sticky left-0 z-20 truncate bg-white p-2 text-left align-bottom">
              Colaborador
            </th>
            {diasDoMes.map((dia, indice) => (
              <th key={dia} className="border-b-0 bg-white p-1 pb-0 text-center text-[10px] font-normal text-slate-400">
                {letrasDoMes[indice]}
              </th>
            ))}
            <th rowSpan={2} className="p-2 text-left align-bottom">
              Totais
            </th>
          </tr>
          <tr>
            {diasDoMes.map((dia) => {
              const cobertura = coberturaPorDia[dia];
              const deficit = cobertura ? cobertura.total < cobertura.minimo : false;
              return (
                <th
                  key={dia}
                  className={cn('border-b border-slate-200 bg-white p-1 pt-0 text-center font-medium', deficit && 'bg-red-100 text-red-900')}
                  title={cobertura ? `Cobertura dia ${dia}: ${cobertura.total}/${cobertura.minimo}` : undefined}
                >
                  {dia}
                  {deficit ? <span className="block text-[10px]">déficit</span> : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody style={virtualizado ? { position: 'relative' } : undefined}>
          {virtualizado ? (
            <tr style={{ height: janela.inicio * ALTURA_LINHA_PX }} aria-hidden="true">
              <td colSpan={diasDoMes.length + 2} />
            </tr>
          ) : null}

          {colaboradores.slice(janela.inicio, janela.fim).map((colaborador, indiceRelativo) => {
            const linha = janela.inicio + indiceRelativo;
            return (
              <tr key={colaborador.id} style={{ height: ALTURA_LINHA_PX }}>
                <td className="sticky left-0 z-10 truncate bg-white p-2 font-medium text-slate-900">
                  {colaborador.nome}
                  <span className="ml-1 text-slate-400">#{colaborador.matricula}</span>
                </td>
                {diasDoMes.map((dia, coluna) => {
                  const celula = colaborador.dias[dia];
                  const chaveCel = `${linha}:${coluna}`;
                  const chaveErro = `${colaborador.id}:${dia}`;
                  const codigoMeta = celula ? codigosPorCodigo.get(celula.codigo) : undefined;
                  return (
                    <td key={dia} className="border border-slate-100 p-0 text-center">
                      {celula ? (
                        <div className="relative">
                          <select
                            ref={(el) => {
                              if (el) celulasRef.current.set(chaveCel, el);
                              else celulasRef.current.delete(chaveCel);
                            }}
                            role="gridcell"
                            aria-label={`${colaborador.nome}, dia ${dia}, código ${celula.codigo}`}
                            tabIndex={foco.linha === linha && foco.coluna === coluna ? 0 : -1}
                            value={celula.codigo}
                            onFocus={() => setFoco({ linha, coluna })}
                            onKeyDown={(evento) => {
                              if (evento.key === 'ArrowRight') { evento.preventDefault(); moverFoco({ coluna: 1 }); }
                              if (evento.key === 'ArrowLeft') { evento.preventDefault(); moverFoco({ coluna: -1 }); }
                              if (evento.key === 'ArrowDown') { evento.preventDefault(); moverFoco({ linha: 1 }); }
                              if (evento.key === 'ArrowUp') { evento.preventDefault(); moverFoco({ linha: -1 }); }
                            }}
                            onChange={(evento) =>
                              void aplicarAlteracao(celula.escalaDiaId, colaborador.id, dia, evento.target.value, false)
                            }
                            className="h-8 w-full appearance-none border-0 bg-transparent text-center text-xs font-semibold focus:outline focus:outline-2 focus:outline-slate-900"
                            style={{ color: codigoMeta?.cor }}
                          >
                            {codigos.map((codigo) => (
                              <option key={codigo.codigo} value={codigo.codigo}>
                                {codigo.codigo}
                              </option>
                            ))}
                          </select>
                          {celula.temExtra ? (
                            <Badge
                              variant="secondary"
                              className="pointer-events-none absolute -right-1 -top-1 z-10 px-1 py-0 text-[9px] font-bold"
                              title="Extra confirmada"
                            >
                              E
                            </Badge>
                          ) : null}
                          {erroPorCelula[chaveErro] ? (
                            <p role="status" className="absolute z-30 mt-1 w-32 rounded bg-red-100 p-1 text-[10px] text-red-900">
                              {erroPorCelula[chaveErro]}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  );
                })}
                <td className="p-2 text-slate-600">
                  {colaborador.totais.trabalhados}T · {colaborador.totais.folgas}F · {colaborador.totais.extras}E ·{' '}
                  {colaborador.totais.horas}h
                </td>
              </tr>
            );
          })}

          {virtualizado ? (
            <tr style={{ height: (totalLinhas - janela.fim) * ALTURA_LINHA_PX }} aria-hidden="true">
              <td colSpan={diasDoMes.length + 2} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function aplicarCodigoNaGrade(
  dados: GradeEscalaDados,
  colaboradorId: string,
  dia: number,
  escalaDia: { id: string; codigo: string; observacao: string | null },
): GradeEscalaDados {
  return {
    ...dados,
    colaboradores: dados.colaboradores.map((colaborador) => {
      if (colaborador.id !== colaboradorId) return colaborador;
      const celulaAnterior = colaborador.dias[dia];
      return {
        ...colaborador,
        dias: {
          ...colaborador.dias,
          [dia]: {
            escalaDiaId: escalaDia.id,
            codigo: escalaDia.codigo,
            turno: colaborador.turnoPadrao,
            temExtra: celulaAnterior?.temExtra ?? false,
            ...(celulaAnterior?.extraTurno ? { extraTurno: celulaAnterior.extraTurno } : {}),
            ...(celulaAnterior?.extraRt ? { extraRt: celulaAnterior.extraRt } : {}),
            ...(escalaDia.observacao ? { observacao: escalaDia.observacao } : {}),
          },
        },
      };
    }),
  };
}
