/**
 * SEC-ACID — Fronteira transacional e estratégia de isolamento.
 *
 * Entregável de `specs/02-seguranca/acid.md`. Duas responsabilidades:
 *
 * 1. `emTransacao` — único ponto de entrada para `prisma.$transaction` com
 *    callback (nunca a forma array — ela não permite ler o resultado de um
 *    passo para decidir o próximo). Isolamento `ReadCommitted` (padrão do
 *    Postgres; `SERIALIZABLE` foi avaliado e rejeitado — ver spec, seção
 *    "Estratégia escolhida": o pico de contenção da abertura da janela
 *    produziria abortos em cascata justo no momento de maior carga).
 * 2. `travarColaborador` / `ordenarParaLock` — a ordem fixa de aquisição de
 *    locks que previne deadlock: advisory lock do colaborador primeiro, row
 *    lock do plantão depois, sempre. Toda função que mexe em mais de um
 *    colaborador ordena os ids antes de travar.
 *
 * `pg_advisory_xact_lock`, nunca `pg_advisory_lock`: o pooler roda em modo
 * *transaction* (connection_limit=1) — um lock de sessão vazaria para outro
 * cliente ou nunca seria liberado. A variante `_xact_` libera no commit,
 * inclusive em rollback.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

/** Cliente de transação — o mesmo tipo que o callback de `prisma.$transaction` recebe. */
export type ClienteTransacao = Prisma.TransactionClient;

export interface OpcoesTransacao {
  timeoutMs?: number;
  maxWaitMs?: number;
}

const TIMEOUT_PADRAO_MS = 8_000; // == statement_timeout do app_server
const MAX_WAIT_PADRAO_MS = 2_000;

/**
 * Único ponto de entrada para transações com mais de uma escrita. Fixa
 * `isolationLevel: 'ReadCommitted'` e os timeouts padrão do sistema — nenhum
 * caller escolhe isolamento diferente sem alterar este módulo (limite rígido
 * de `SEC-ACID`).
 *
 * ```ts
 * // ❌ nunca: await prisma.$transaction([stepA, stepB])
 * // ✅ sempre:
 * await emTransacao(prisma, async (tx) => { ... });
 * ```
 */
export async function emTransacao<T>(
  prisma: PrismaClient,
  callback: (tx: ClienteTransacao) => Promise<T>,
  opcoes: OpcoesTransacao = {},
): Promise<T> {
  return prisma.$transaction(callback, {
    isolationLevel: 'ReadCommitted',
    timeout: opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS,
    maxWait: opcoes.maxWaitMs ?? MAX_WAIT_PADRAO_MS,
  });
}

/**
 * Advisory lock transacional por colaborador — passo 1 da ordem de aquisição.
 * `hashtextextended` com seed fixa 0, igual ao lado SQL, para que o mesmo
 * `colaboradorId` sempre produza o mesmo lock, seja a chamada feita daqui ou
 * de dentro de uma função PL/pgSQL.
 */
export async function travarColaborador(tx: ClienteTransacao, colaboradorId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${colaboradorId}::text, 0))`;
}

/**
 * Ordena ids de colaborador antes de uma operação em lote que trava vários.
 * Duas transações que peguem locks na mesma ordem não formam ciclo — a
 * garantia inteira de "sem deadlock" depende de toda chamada em lote passar
 * por aqui antes de travar.
 */
export function ordenarParaLock(colaboradorIds: readonly string[]): string[] {
  return [...colaboradorIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Trava, em ordem, uma lista de colaboradores. Uso em operações de lote
 * (ausência em lote, criação de plantões em lote) que tocam vários
 * colaboradores na mesma transação.
 */
export async function travarColaboradores(tx: ClienteTransacao, colaboradorIds: readonly string[]): Promise<void> {
  for (const id of ordenarParaLock(colaboradorIds)) {
    await travarColaborador(tx, id);
  }
}

/** Códigos de erro Postgres traduzidos para erro de negócio pela API (ver `CONVENTIONS.md`). */
export const CODIGO_ERRO_POSTGRES = {
  /** `lock_timeout` estourado — vira `SISTEMA_OCUPADO` com `Retry-After: 1`, não 500. */
  LOCK_TIMEOUT: '55P03',
  /** Violação de índice único / exclusion constraint — vira `JA_MARCADO` ou equivalente. */
  UNIQUE_VIOLATION: '23505',
  EXCLUSION_VIOLATION: '23P01',
} as const;

/** Erro do driver Postgres exposto por `Prisma.PrismaClientKnownRequestError` com `meta.code` do driver. */
export interface ErroPostgres {
  code?: string;
  meta?: { code?: string };
}

/** Extrai o código de erro SQLSTATE de um erro lançado pelo driver, se houver. */
export function codigoSqlstate(erro: unknown): string | undefined {
  if (typeof erro !== 'object' || erro === null) return undefined;
  const candidato = erro as ErroPostgres;
  return candidato.meta?.code ?? candidato.code;
}

export function ehLockTimeout(erro: unknown): boolean {
  return codigoSqlstate(erro) === CODIGO_ERRO_POSTGRES.LOCK_TIMEOUT;
}

export function ehViolacaoDeUnicidade(erro: unknown): boolean {
  const codigo = codigoSqlstate(erro);
  return codigo === CODIGO_ERRO_POSTGRES.UNIQUE_VIOLATION || codigo === CODIGO_ERRO_POSTGRES.EXCLUSION_VIOLATION;
}
