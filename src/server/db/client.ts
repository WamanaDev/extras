/**
 * Singleton do `PrismaClient` usado pelas rotas de API.
 *
 * Não é entregável de nenhuma spec lida por este agente (`admin-escala`) —
 * `contrato-comum.md`/`handler.ts` já resolvem a sessão via um singleton
 * interno (`obterPrismaSingleton`, não exportado), mas nenhuma spec de
 * `04-api/*` até agora tinha precisado do cliente dentro do próprio handler
 * de rota para consultar dados de negócio (as specs de `admin-escala`
 * precisam: grade, alteração de dia, lote, exportação — todas leem/escrevem
 * `escala_dia`/`ciclo`/`colaborador`/`marcacao`). Criado aqui, minúsculo e
 * reaproveitável por qualquer outra rota que precise do mesmo cliente, em vez
 * de cada `route.ts` instanciar o seu.
 *
 * Import dinâmico (mesmo padrão de `src/server/http/handler.ts`,
 * `resolverSessaoColaborador`): nenhum teste que só exercita lógica pura
 * precisa de `DATABASE_URL`/cliente gerado no processo.
 */
import type { PrismaClient } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mesmo padrão isolado de handler.ts: `any` só neste ponto de bootstrap.
let prismaSingleton: any = null;

export async function obterPrisma(): Promise<PrismaClient> {
  if (!prismaSingleton) {
    const { PrismaClient: PrismaClientCtor } = await import('@prisma/client');
    prismaSingleton = new PrismaClientCtor();
  }
  return prismaSingleton;
}

/** Só para teste: permite injetar/limpar o singleton entre casos. */
export function _resetPrismaSingletonParaTeste(cliente: unknown = null): void {
  prismaSingleton = cliente;
}
