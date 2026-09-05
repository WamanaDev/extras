/** `POST /api/admin/ciclos/:id/fechar` (API-ADM-CIC-006). */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/ciclos/compartilhado';
import { FecharCicloBodySchema, fecharCiclo } from '@/server/ciclos/fechar';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const POST = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  body: FecharCicloBodySchema,
  params: ParamsSchema,
  handler: async ({ body, params, ator, ctx }) => fecharCiclo(obterPrisma(), params.id, body, ator, ctx),
});
