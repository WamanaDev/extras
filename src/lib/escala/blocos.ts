/**
 * DOM-002 — Blocos de jornada e regra de descanso.
 *
 * Todo compromisso (plantão base ou extra) vira um intervalo semiaberto
 * `[inicio, fim)` em `timestamptz`. Semiaberto é essencial: `[07,19)` e
 * `[19,07+1)` são contíguos, não sobrepostos — com intervalo fechado todo turno
 * colidiria com o seguinte.
 *
 * Esta função existe duas vezes: aqui em TS (para a UI antecipar o bloqueio) e em
 * PL/pgSQL (FN-004, decisão final). Divergência entre as duas é bug de
 * severidade alta — ver `07-testes/paridade-escala.md`. Por isso a lógica não é
 * simplificada nem reescrita "de forma mais elegante": segue o pseudocódigo da
 * spec ao pé da letra.
 */

import type { Turno } from './ancora';

/** Intervalo semiaberto `[inicio, fim)` representando um bloco de 12h ocupado. */
export interface Bloco {
  inicio: Date;
  fim: Date;
}

export type ResultadoValidacaoJornada = 'CONFLITO_DE_HORARIO' | 'EXCEDE_JORNADA' | null;

/** Duração de um bloco de plantão 12x36, em horas. */
export const HORAS_POR_BLOCO = 12;

/** America/Sao_Paulo não observa horário de verão desde 2019: offset fixo UTC-3. */
const OFFSET_SAO_PAULO_HORAS = -3;

/**
 * Constrói o intervalo `[inicio, fim)` de um turno no dia `data` (data civil,
 * sem componente de hora — ex.: `new Date(Date.UTC(ano, mes-1, dia))`).
 *
 * DIURNO em D: `D 07:00` → `D 19:00`.
 * NOTURNO em D: `D 19:00` → `D+1 07:00`.
 *
 * Os instantes são calculados em America/Sao_Paulo (UTC-3 fixo) e representados
 * internamente como `Date` (equivalente a `timestamptz`).
 */
export function blocoDoTurno(data: Date, turno: Turno): Bloco {
  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth();
  const dia = data.getUTCDate();

  if (turno === 'DIURNO') {
    return {
      inicio: new Date(Date.UTC(ano, mes, dia, 7 - OFFSET_SAO_PAULO_HORAS)),
      fim: new Date(Date.UTC(ano, mes, dia, 19 - OFFSET_SAO_PAULO_HORAS)),
    };
  }

  return {
    inicio: new Date(Date.UTC(ano, mes, dia, 19 - OFFSET_SAO_PAULO_HORAS)),
    fim: new Date(Date.UTC(ano, mes, dia + 1, 7 - OFFSET_SAO_PAULO_HORAS)),
  };
}

/**
 * `validaDescanso` — as duas regras unificadas:
 *
 * 1. Sobreposição de intervalos → `CONFLITO_DE_HORARIO` (não pode pegar extra no
 *    mesmo horário do próprio plantão).
 * 2. Cadeia contígua (fim de um bloco == início exato do próximo) maior que
 *    `maxBlocos` → `EXCEDE_JORNADA` (não pode encadear mais que N blocos de 12h
 *    seguidos, ex.: 36h com `maxBlocos = 2`).
 *
 * `blocos` já deve vir ordenado por `inicio`, carregado da janela
 * `[inicio − janela, fim + janela]` do novo bloco (ver `jornada.ts`) — esta
 * função não faz I/O.
 */
export function validaDescanso(
  blocos: Bloco[],
  novo: Bloco,
  maxBlocos: number,
): ResultadoValidacaoJornada {
  for (const b of blocos) {
    if (b.inicio < novo.fim && b.fim > novo.inicio) return 'CONFLITO_DE_HORARIO';
  }

  const todos = [...blocos, novo].sort((a, b) => +a.inicio - +b.inicio);
  let corrida = 1;
  for (let i = 1; i < todos.length; i++) {
    // `i` vai de 1 até `todos.length - 1`, então `todos[i]` e `todos[i - 1]`
    // sempre existem — a asserção só contorna `noUncheckedIndexedAccess`,
    // sem alterar a lógica do pseudocódigo da spec (01-dominio/blocos-jornada.md).
    const atual = todos[i]!;
    const anterior = todos[i - 1]!;
    corrida = +atual.inicio === +anterior.fim ? corrida + 1 : 1;
    if (corrida > maxBlocos) return 'EXCEDE_JORNADA';
  }
  return null;
}
