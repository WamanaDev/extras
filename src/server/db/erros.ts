/**
 * DB-002 — Mapeamento centralizado de código de erro Postgres → erro da API.
 *
 * Entregável de `specs/03-banco/constraints.md`, seção "Códigos de erro →
 * API": "Mapeamento centralizado em `src/server/db/erros.ts`. Nenhum handler
 * traduz SQLSTATE na mão." Todo handler de rota que capturar um erro do
 * Prisma/driver Postgres passa por `erroApiParaPostgres` (ou pela tabela
 * `MAPA_ERROS_POSTGRES` diretamente) em vez de comparar `error.code` a olho.
 *
 * Reaproveita `codigoSqlstate` de `./tx` (já usado para os predicados de
 * lock/unicidade em `SEC-ACID`) em vez de duplicar a extração do SQLSTATE —
 * fonte única para "como ler o código de erro do driver".
 */
import { codigoSqlstate } from './tx';

/** Nomes de erro de API usados neste mapeamento — `SCREAMING_SNAKE`, sem acento (CONVENTIONS.md). */
export type ErroApi =
  | 'JA_MARCADO'
  | 'CONFLITO_DE_HORARIO'
  | 'ESCALA_SOBREPOSTA'
  | 'SEM_VAGA'
  | 'REFERENCIA_INVALIDA'
  | 'SISTEMA_OCUPADO';

export interface MapeamentoErroPostgres {
  readonly sqlstate: string;
  /** Nome da constraint associada. `null` quando o SQLSTATE não é específico de uma constraint (ex.: deadlock). */
  readonly constraint: string | null;
  readonly erro: ErroApi;
  readonly http: number;
}

/**
 * Tabela literal de `specs/03-banco/constraints.md`, seção "Códigos de erro
 * → API". Não editar sem revisão humana (mesmo limite rígido da spec-fonte).
 *
 * Duas linhas compartilham o SQLSTATE `23P01` (exclusion violation) —
 * distinguidas pelo nome da constraint, por isso a busca (`erroApiParaPostgres`)
 * usa `(sqlstate, constraint)` e não só `sqlstate` quando a constraint está
 * disponível.
 */
export const MAPA_ERROS_POSTGRES: readonly MapeamentoErroPostgres[] = [
  { sqlstate: '23505', constraint: 'marcacao_unica_confirmada', erro: 'JA_MARCADO', http: 409 },
  { sqlstate: '23P01', constraint: 'excl_marcacao_sobreposta', erro: 'CONFLITO_DE_HORARIO', http: 409 },
  { sqlstate: '23P01', constraint: 'excl_escala_sobreposta', erro: 'ESCALA_SOBREPOSTA', http: 409 },
  { sqlstate: '23514', constraint: 'chk_vagas', erro: 'SEM_VAGA', http: 409 },
  { sqlstate: '23503', constraint: null, erro: 'REFERENCIA_INVALIDA', http: 409 },
  { sqlstate: '55P03', constraint: null, erro: 'SISTEMA_OCUPADO', http: 503 },
  { sqlstate: '40P01', constraint: null, erro: 'SISTEMA_OCUPADO', http: 503 },
] as const;

/** Erro do driver Postgres exposto por `Prisma.PrismaClientKnownRequestError`, incluindo o nome da constraint quando disponível. */
export interface ErroPostgresComConstraint {
  code?: string;
  meta?: { code?: string; constraint?: string; target?: string | string[] };
}

/** Extrai o nome da constraint de um erro do driver, se houver (`meta.constraint`, formato do Prisma). */
function nomeConstraint(erro: unknown): string | undefined {
  if (typeof erro !== 'object' || erro === null) return undefined;
  const meta = (erro as ErroPostgresComConstraint).meta;
  return meta?.constraint;
}

/**
 * Traduz um erro capturado (do Prisma ou do driver `pg`) para o erro de API
 * correspondente, conforme a tabela de `constraints.md`. Retorna `undefined`
 * quando o SQLSTATE não está mapeado — nesse caso o chamador deve tratar
 * como erro interno (500), nunca inventar um código de erro de API.
 *
 * Quando o SQLSTATE tem mais de uma linha na tabela (caso de `23P01`), o
 * nome da constraint decide qual. Se o nome da constraint não estiver
 * disponível no erro capturado, a primeira linha compatível com o SQLSTATE
 * é usada — o chamador deve preferir sempre repassar o erro original (não
 * um SQLSTATE isolado) para que a constraint possa ser lida.
 */
export function erroApiParaPostgres(erro: unknown): MapeamentoErroPostgres | undefined {
  const sqlstate = codigoSqlstate(erro);
  if (sqlstate === undefined) return undefined;

  const constraint = nomeConstraint(erro);
  const candidatos = MAPA_ERROS_POSTGRES.filter((linha) => linha.sqlstate === sqlstate);
  if (candidatos.length === 0) return undefined;
  if (candidatos.length === 1) return candidatos[0];

  const porConstraint = constraint !== undefined ? candidatos.find((linha) => linha.constraint === constraint) : undefined;
  return porConstraint ?? candidatos[0];
}
