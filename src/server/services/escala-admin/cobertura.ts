/**
 * Simulação de cobertura antes/depois de uma troca de código de ausência —
 * usado por `API-ADM-ESC-002` (impacto de um dia) e `API-ADM-ESC-003`
 * (impacto agregado de um lote).
 *
 * Em vez de aplicar a mudança e reconsultar `FN-009 cobertura_ciclo`
 * (`specs/03-banco/funcoes/fn-009-cobertura-ciclo.md`) duas vezes dentro da
 * mesma transação, a rota lê a cobertura atual (`antes`) uma única vez e
 * simula `depois` em memória: a única coisa que muda quando um `escala_dia`
 * troca de código é se aquela linha conta como `presenca` ou não
 * (DOM-003.4). `total`/`deficit` andam exatamente por esse delta de ±1.
 * Determinístico e testável sem banco.
 */

export interface CoberturaDia {
  rt: string;
  turno: 'DIURNO' | 'NOTURNO';
  total: number;
  minimo: number;
}

export interface CoberturaComDeficit extends CoberturaDia {
  deficit: number;
}

function comDeficit(cobertura: CoberturaDia): CoberturaComDeficit {
  return { ...cobertura, deficit: Math.max(cobertura.minimo - cobertura.total, 0) };
}

/**
 * `simularCoberturaAposTroca` — dado o estado atual de cobertura do
 * (dia, RT, turno) e se o código antigo/novo do colaborador conta como
 * presença (DOM-003.4), devolve o estado projetado.
 */
export function simularCoberturaAposTroca(
  antes: CoberturaDia,
  presencaAntiga: boolean,
  presencaNova: boolean,
): CoberturaComDeficit {
  const delta = Number(presencaNova) - Number(presencaAntiga);
  return comDeficit({ ...antes, total: antes.total + delta });
}

export function coberturaAntesComoImpacto(antes: CoberturaDia): CoberturaComDeficit {
  return comDeficit(antes);
}
