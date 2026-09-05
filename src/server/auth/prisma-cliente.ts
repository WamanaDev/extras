/**
 * Singleton de `PrismaClient` para as rotas de `04-api/auth/*`.
 *
 * Mesmo padrão de `obterPrismaSingleton` em `src/server/http/handler.ts`
 * (import dinâmico — nenhuma rota que injete seus próprios deps em teste
 * precisa de `DATABASE_URL` disponível no processo). Não reexporta o de
 * `handler.ts` porque aquele símbolo é privado ao módulo (não exportado) —
 * duplicar um singleton de duas linhas é mais simples e mais seguro entre
 * agentes paralelos do que exportar/acoplar um símbolo interno de `API-000`
 * (`contrato-comum.md`, entregável de outro dono, alteração exige revisão).
 */
import type { PrismaClient } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mesmo isolamento de `any` que `handler.ts` faz no bootstrap do client dinâmico.
let prismaSingleton: any = null;

export async function obterPrismaAuth(): Promise<PrismaClient> {
  if (!prismaSingleton) {
    const { PrismaClient: Ctor } = await import('@prisma/client');
    prismaSingleton = new Ctor();
  }
  return prismaSingleton as PrismaClient;
}
