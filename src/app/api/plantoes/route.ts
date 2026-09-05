/**
 * API-COL-003 — `GET /api/plantoes?cicloId=`.
 *
 * Rota mais chamada no pico (spec, CIA-D) — `cache: 'grade-extras'`
 * (`private, max-age=5`) é o que segura o thundering herd (`SEC-DISP`).
 */
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { buscarGradePlantoes } from '@/server/services/colaborador/plantoes';

let prisma: PrismaClient | null = null;
function obterPrisma(): PrismaClient {
  prisma ??= new PrismaClient();
  return prisma;
}

const QuerySchema = z.object({
  cicloId: z.string().uuid(),
});

export const GET = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: {
    escopo: 'leitura_por_sessao',
    identificador: ({ request }) => request.cookies.get('sessao_colaborador')?.value ?? 'anon',
  },
  query: QuerySchema,
  cache: 'grade-extras',
  handler: async ({ ator, query }) => {
    return buscarGradePlantoes(obterPrisma(), query.cicloId, ator.colaboradorId);
  },
});
