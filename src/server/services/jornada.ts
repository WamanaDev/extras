/**
 * DOM-002 — Orquestração de jornada: carrega a janela de blocos ocupados de um
 * colaborador e delega a decisão a `validaDescanso` (`src/lib/escala/blocos.ts`).
 *
 * Este módulo NÃO acessa o Prisma diretamente. `prisma/schema.prisma` é hoje um
 * stub — o modelo real (`escala_dia`, `marcacao`, etc.) é entregável de
 * `03-banco/*` (Onda 1) e não deve ser antecipado aqui (ver comentário no topo do
 * schema e `specs/00-fundacao/stack.md`, decisão D-01). Por isso o carregamento
 * dos blocos é injetado via `CarregarBlocosOcupados`: quem chamar este módulo
 * depois que a Onda 1 existir fornece um adaptador que chama a função espelho no
 * banco, `FN-003 blocos_ocupados` (`specs/03-banco/funcoes/fn-003-blocos-ocupados.md`).
 *
 * A decisão final de jornada nunca é desta camada — é sempre do banco
 * (`FN-004 valida_descanso`, ver `specs/AGENTS.md`, item "Nunca confie no
 * cliente"). Esta função existe só para a UI antecipar o bloqueio.
 */

import type { Bloco, ResultadoValidacaoJornada } from '@/lib/escala/blocos';
import { HORAS_POR_BLOCO, validaDescanso } from '@/lib/escala/blocos';

/** Janela `[de, ate]` usada para carregar blocos ocupados de um colaborador. */
export interface JanelaBlocos {
  de: Date;
  ate: Date;
}

/**
 * Janela derivada, não constante: `(maxBlocos + 1) * 12h` para os dois lados do
 * bloco novo. Com `maxBlocos = 2` dá 36h de cada lado — suficiente para qualquer
 * cadeia relevante. Se `maxBlocos` subir, a janela acompanha (ver
 * `01-dominio/blocos-jornada.md` e `FN-004`, seção "Notas de projeto").
 */
export function calculaJanela(novo: Bloco, maxBlocos: number): JanelaBlocos {
  const horasJanela = (maxBlocos + 1) * HORAS_POR_BLOCO;
  const msJanela = horasJanela * 60 * 60 * 1000;
  return {
    de: new Date(+novo.inicio - msJanela),
    ate: new Date(+novo.fim + msJanela),
  };
}

/**
 * Porta de acesso a dados — implementada por um adaptador que sabe consultar o
 * banco (espelho de `FN-003 blocos_ocupados`). Não é responsabilidade deste
 * módulo saber como os blocos são armazenados.
 */
export type CarregarBlocosOcupados = (
  colaboradorId: string,
  janela: JanelaBlocos,
) => Promise<Bloco[]>;

/**
 * `validaJornada` — monta a janela, carrega os blocos ocupados do colaborador
 * nessa janela e delega a `validaDescanso` (sem I/O) a decisão.
 *
 * Não faz laço de queries: uma única chamada a `carregarBlocosOcupados` cobre a
 * janela inteira, como exige `01-dominio/blocos-jornada.md`.
 */
export async function validaJornada(
  carregarBlocosOcupados: CarregarBlocosOcupados,
  colaboradorId: string,
  novo: Bloco,
  maxBlocos: number,
): Promise<ResultadoValidacaoJornada> {
  const janela = calculaJanela(novo, maxBlocos);
  const blocos = await carregarBlocosOcupados(colaboradorId, janela);
  const ordenados = [...blocos].sort((a, b) => +a.inicio - +b.inicio);
  return validaDescanso(ordenados, novo, maxBlocos);
}
