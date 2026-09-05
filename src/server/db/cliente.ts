/**
 * Singleton de `PrismaClient` reaproveitado pelas rotas de `04-api/*`.
 *
 * `src/server/http/handler.ts` já mantém um singleton próprio (privado,
 * usado só para resolver sessão de colaborador) — este módulo é o
 * equivalente para o *corpo* das rotas (o `handler` de `defineHandler`, que
 * precisa do client para abrir transação via `emTransacao`). Não reaproveita
 * o singleton de `handler.ts` porque aquele é interno ao módulo (não
 * exportado) — duplicar a instância do client não duplica conexão real: o
 * datasource já roda atrás do pooler em modo *transaction* (`DATABASE_URL`,
 * `pgbouncer=true`), então múltiplos `PrismaClient` no mesmo processo Node
 * apenas multiplicam o objeto JS, não a conexão física.
 *
 * Import dinâmico (não estático no topo do módulo): mantém rotas testáveis
 * sem exigir `DATABASE_URL`/cliente Prisma gerado no processo de teste —
 * mesmo raciocínio já documentado em `handler.ts`.
 */
import type { PrismaClient } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tipo do PrismaClient importado dinamicamente; `any` isolado neste único ponto de bootstrap.
let singleton: any = null;

export async function obterPrisma(): Promise<PrismaClient> {
  if (!singleton) {
    const { PrismaClient: Ctor } = await import('@prisma/client');
    singleton = new Ctor();
  }
  return singleton as PrismaClient;
}
