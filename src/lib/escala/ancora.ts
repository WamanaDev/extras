/**
 * DOM-001 — Escala 12x36 (cálculo por âncora).
 *
 * O dia trabalhado NUNCA é armazenado. É derivado da âncora:
 *
 *   trabalha(D) ⟺ ((D − ancora) mod periodo + periodo) mod periodo == 0
 *
 * `periodo = 2` para 12x36. O mod duplo trata datas anteriores à âncora, já que em
 * muitas linguagens (e no Postgres) `-1 % 2 == -1`.
 *
 * Este módulo é a "fonte da verdade" em TypeScript. A função equivalente em
 * PL/pgSQL (FN-002) precisa produzir exatamente o mesmo resultado — ver
 * `07-testes/paridade-escala.md`. Por isso a lógica aqui NÃO é simplificada.
 */

/** Turno de um plantão 12x36. */
export type Turno = 'DIURNO' | 'NOTURNO';

/**
 * Histórico de troca de escala de um colaborador (espelha o model `TrocaEscala`).
 * Nunca se edita a âncora no lugar: cria-se uma linha aqui com `vigenciaInicio`.
 */
export interface TrocaEscala {
  vigenciaInicio: Date;
  turno: Turno;
  ancora: Date;
  periodo: number;
}

/**
 * Diferença em dias de calendário entre `data` e `referencia` (data − referencia),
 * ignorando hora/minuto/segundo e fuso — ambas são tratadas como datas civis
 * (`date`, não `timestamptz`). Usar `Date.UTC` com os componentes de calendário
 * evita que DST ou fuso local do processo Node contamine a conta.
 */
function diferencaEmDias(data: Date, referencia: Date): number {
  const utcData = Date.UTC(data.getFullYear(), data.getMonth(), data.getDate());
  const utcReferencia = Date.UTC(
    referencia.getFullYear(),
    referencia.getMonth(),
    referencia.getDate(),
  );
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((utcData - utcReferencia) / MS_POR_DIA);
}

/**
 * Módulo duplo: trata corretamente diferenças negativas (data anterior à âncora).
 * Em JS, assim como em Postgres, `%` é resto-com-sinal, não módulo matemático.
 */
function moduloDuplo(valor: number, divisor: number): number {
  return ((valor % divisor) + divisor) % divisor;
}

/**
 * `trabalhaEm` — o colaborador trabalha no dia `data`, dada a âncora e a
 * periodicidade (2 para 12x36)?
 */
export function trabalhaEm(data: Date, ancora: Date, periodo: number): boolean {
  const diferenca = diferencaEmDias(data, ancora);
  return moduloDuplo(diferenca, periodo) === 0;
}

/** Quantidade de dias no mês `mes` (1-12) de `ano`. */
function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Letra do dia da semana (convenção brasileira de planilha de escala: D S T
 * Q Q S S — Domingo, Segunda, Terça, Quarta, Quinta, Sexta, Sábado; Quarta/
 * Quinta e Sexta/Sábado compartilham letra de propósito, é a abreviação
 * padrão). Puramente apresentacional — pedido do usuário pra mostrar em cima
 * do número do dia na grade/impressão/planilha, igual a uma escala real
 * (nenhuma regra de negócio depende disso, diferente de `trabalhaEm`).
 */
const LETRAS_DIA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;

export function letraDiaSemana(ano: number, mes: number, dia: number): string {
  const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return LETRAS_DIA_SEMANA[diaSemana]!;
}

/**
 * `diasDoMes` — todas as datas do mês (`mes` 1-12) em que o colaborador trabalha,
 * dada uma âncora e periodicidade fixas (sem considerar troca de escala — isso é
 * responsabilidade de `ancoraVigente`, resolvida dia a dia por quem materializa a
 * escala).
 */
export function diasDoMes(ancora: Date, periodo: number, ano: number, mes: number): Date[] {
  const totalDias = diasNoMes(ano, mes);
  const resultado: Date[] = [];
  for (let dia = 1; dia <= totalDias; dia++) {
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    if (trabalhaEm(data, ancora, periodo)) {
      resultado.push(data);
    }
  }
  return resultado;
}

/**
 * `ancoraVigente` — resolve a âncora/periodicidade/turno aplicável a uma data,
 * considerando o histórico de trocas. A âncora aplicável é a da troca mais
 * recente cujo `vigenciaInicio <= data`; na ausência de troca aplicável, usa o
 * cadastro do colaborador. Escalas de meses anteriores a uma troca permanecem
 * intactas porque a resolução é sempre por data, nunca por edição no lugar.
 */
export function ancoraVigente(
  colaborador: { escalaAncora: Date; escalaPeriodo: number; turnoPadrao: Turno },
  trocas: TrocaEscala[],
  data: Date,
): { ancora: Date; periodo: number; turno: Turno } {
  let maisRecente: TrocaEscala | null = null;

  for (const troca of trocas) {
    if (diferencaEmDias(data, troca.vigenciaInicio) < 0) continue; // troca ainda não vigente
    if (maisRecente === null || diferencaEmDias(troca.vigenciaInicio, maisRecente.vigenciaInicio) > 0) {
      maisRecente = troca;
    }
  }

  if (maisRecente !== null) {
    return { ancora: maisRecente.ancora, periodo: maisRecente.periodo, turno: maisRecente.turno };
  }

  return {
    ancora: colaborador.escalaAncora,
    periodo: colaborador.escalaPeriodo,
    turno: colaborador.turnoPadrao,
  };
}

export type Paridade = 'PAR' | 'IMPAR' | 'MISTA';

/**
 * `previewMeses` — pré-visualização de `n` meses a partir de `ano/mes` (`mes` 1-12).
 *
 * `paridade` é apenas rótulo de UI (par/ímpar do dia-do-mês predominante nesse
 * mês). Nenhuma decisão do sistema depende dela — a paridade "vira sozinha" em
 * meses com número ímpar de dias, por isso nunca é persistida nem usada em regra.
 */
export function previewMeses(
  ancora: Date,
  periodo: number,
  ano: number,
  mes: number,
  n: number,
): Array<{ ano: number; mes: number; dias: number[]; paridade: Paridade }> {
  const resultado: Array<{ ano: number; mes: number; dias: number[]; paridade: Paridade }> = [];

  let anoAtual = ano;
  let mesAtual = mes;

  for (let i = 0; i < n; i++) {
    const datas = diasDoMes(ancora, periodo, anoAtual, mesAtual);
    const dias = datas.map((d) => d.getUTCDate());

    let paridade: Paridade;
    if (dias.length === 0) {
      paridade = 'MISTA';
    } else {
      const temPar = dias.some((d) => d % 2 === 0);
      const temImpar = dias.some((d) => d % 2 !== 0);
      paridade = temPar && temImpar ? 'MISTA' : temPar ? 'PAR' : 'IMPAR';
    }

    resultado.push({ ano: anoAtual, mes: mesAtual, dias, paridade });

    mesAtual += 1;
    if (mesAtual > 12) {
      mesAtual = 1;
      anoAtual += 1;
    }
  }

  return resultado;
}
