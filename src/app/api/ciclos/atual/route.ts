/**
 * API-COL-001 — `GET /api/ciclos/atual`.
 *
 * Lógica em `src/server/services/colaborador/ciclo-atual.ts` (testável sem
 * Postgres real) — este arquivo só faz a fiação exigida por `contrato-comum.md`
 * (`defineHandler`) e provê o `PrismaClient` de verdade.
 */
import { PrismaClient } from '@prisma/client';
import { defineHandler } from '@/server/http/handler';
import { buscarCicloAtual } from '@/server/services/colaborador/ciclo-atual';

let prisma: PrismaClient | null = null;
function obterPrisma(): PrismaClient {
  prisma ??= new PrismaClient();
  return prisma;
}

export const GET = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: {
    escopo: 'leitura_por_sessao',
    identificador: ({ request }) => request.cookies.get('sessao_colaborador')?.value ?? 'anon',
  },
  cache: 'grade-extras', // D: `private, max-age=5` (spec CIA).
  handler: async ({ ctx }) => {
    return buscarCicloAtual(obterPrisma(), ctx.agora);
  },
});
