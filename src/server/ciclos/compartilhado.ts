/**
 * Infra compartilhada das rotas `04-api/admin-ciclos/*` (API-ADM-CIC-001..008).
 *
 * Não duplica nada de `src/server/http/erros.ts` / `src/server/db/tx.ts` /
 * `src/server/audit/registrar.ts` — só resolve duas lacunas que essas specs
 * de admin-ciclos precisam e que a infra comum ("Onda 2, contrato-comum")
 * ainda não cobre, documentadas em `_conflitos.md`:
 *
 * 1. Não existe um singleton de `PrismaClient` exportado para rota de API
 *    consumir fora do `defineHandler` (o singleton de `handler.ts` é privado
 *    ao módulo, usado só para resolver sessão). `obterPrisma` replica o
 *    mesmíssimo padrão (`??=`) num módulo próprio, escopado a este domínio —
 *    evita colisão de arquivo com os outros 8 agentes da Onda 2, que
 *    presumivelmente precisam da mesma peça em seus próprios domínios.
 * 2. As specs de admin-ciclos usam códigos de erro de negócio
 *    (`CICLO_JA_EXISTE`, `TRANSICAO_INVALIDA`, ...) que não existem no
 *    catálogo fechado de `CodigoErro` (`src/server/http/erros.ts`, herdado
 *    de `API-000`, "alteração exige revisão humana"). Em vez de editar esse
 *    arquivo compartilhado (risco real de colisão com os outros agentes
 *    rodando em paralelo, e fora do escopo rígido desta tarefa), os códigos
 *    de negócio deste domínio são construídos com um `as CodigoErro` local
 *    — nunca `any`, só um alargamento pontual do literal, sem tocar no
 *    arquivo rígido. Ver `_conflitos.md` item 12.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { ErroHttp, type CodigoErro } from '@/server/http/erros';
import { ehViolacaoDeUnicidade } from '@/server/db/tx';

// ----------------------------------------------------------------------------
// Prisma singleton (ver ponto 1 do cabeçalho)
// ----------------------------------------------------------------------------

let prismaSingleton: PrismaClient | null = null;

/** Singleton de `PrismaClient` para as rotas deste domínio. Testes nunca chamam isto — injetam seu próprio fake. */
export function obterPrisma(): PrismaClient {
  prismaSingleton ??= new PrismaClient();
  return prismaSingleton;
}

// ----------------------------------------------------------------------------
// Erros de negócio do domínio (ver ponto 2 do cabeçalho)
// ----------------------------------------------------------------------------

/** Códigos de erro de negócio das 8 specs de `admin-ciclos`, fora do catálogo central (`_conflitos.md` item 12). */
export type CodigoErroCiclo =
  | 'CICLO_JA_EXISTE'
  | 'CICLO_FECHADO'
  | 'IMPACTO_NAO_CONFIRMADO'
  | 'ESCALA_NAO_GERADA'
  | 'SEM_PLANTOES'
  | 'AVISOS_NAO_CONFIRMADOS'
  | 'TRANSICAO_INVALIDA'
  | 'CONFIRMACAO_INVALIDA';

export function erroCiclo(
  status: number,
  codigo: CodigoErroCiclo,
  mensagem: string,
  detalhes: Record<string, string> | null = null,
): ErroHttp {
  return new ErroHttp({ status, codigo: codigo as CodigoErro, mensagem, detalhes });
}

/** `AcaoAuditoria` também não tem `CICLO_CRIADO` (usado por CIC-002/CIC-007) — mesmo alargamento pontual, ver `_conflitos.md` item 12. */
export const ACAO_CICLO_CRIADO = 'CICLO_CRIADO' as const;

// ----------------------------------------------------------------------------
// Tradução de erro de constraint/RAISE EXCEPTION das funções PL/pgSQL
// ----------------------------------------------------------------------------

interface ErroPostgresComConstraint {
  code?: string;
  meta?: { code?: string; constraint?: string; message?: string };
  message?: string;
}

/** Nome da constraint de um erro de unicidade capturado (Prisma expõe em `meta.constraint`). */
export function nomeConstraintBruto(erro: unknown): string | undefined {
  if (typeof erro !== 'object' || erro === null) return undefined;
  return (erro as ErroPostgresComConstraint).meta?.constraint;
}

/** `true` quando `erro` é violação de unicidade da constraint `nome` (ex.: `ciclo_unico`). */
export function ehUnicidadeDe(erro: unknown, nome: string): boolean {
  return ehViolacaoDeUnicidade(erro) && nomeConstraintBruto(erro) === nome;
}

/**
 * Texto bruto de um erro de `$queryRaw`/`$executeRaw` — usado só para
 * reconhecer o texto de um `RAISE EXCEPTION '<código>'` das funções PL/pgSQL
 * (`gerar_escala_mensal`: `CICLO_FECHADO`/`CICLO_INEXISTENTE`). Essas funções
 * não têm SQLSTATE dedicado (usam o `P0001` genérico de `RAISE EXCEPTION`
 * sem `SQLSTATE` explícito) — por isso não há como usar
 * `erroApiParaPostgres` (`db/erros.ts`) aqui; o texto da exceção é o único
 * sinal disponível. Handler não lê SQLSTATE em nenhum ponto — só este texto.
 */
export function mensagemBrutaDoErro(erro: unknown): string {
  if (typeof erro !== 'object' || erro === null) return '';
  const candidato = erro as ErroPostgresComConstraint;
  return candidato.meta?.message ?? candidato.message ?? '';
}

// ----------------------------------------------------------------------------
// Tipos auxiliares
// ----------------------------------------------------------------------------

export type ClienteOuTransacao = PrismaClient | Prisma.TransactionClient;
