/**
 * API-COL-007 — `GET /api/meu-saldo?cicloId=`.
 *
 * Rota leve, chamada a cada evento de Realtime (spec, "D") — `cache:
 * 'grade-extras'` (`private, max-age=5`), mesma política de `/api/plantoes`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { buscarMeuSaldo } from '@/server/services/colaborador/saldo';

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
    const prisma = await obterPrisma();
    return buscarMeuSaldo(prisma, ator.colaboradorId, query.cicloId);
  },
});
