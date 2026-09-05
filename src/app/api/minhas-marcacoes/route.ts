/**
 * API-COL-006 — `GET /api/minhas-marcacoes?cicloId=`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { buscarMinhasMarcacoes } from '@/server/services/colaborador/minhas-marcacoes';

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
  cache: 'pessoal', // CIA — C: `private, no-store` (só as próprias marcações).
  handler: async ({ ator, query, ctx }) => {
    const prisma = await obterPrisma();
    return buscarMinhasMarcacoes(prisma, ator.colaboradorId, query.cicloId, ctx.agora);
  },
});
