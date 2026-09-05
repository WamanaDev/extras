/** `POST /api/admin/ciclos/:id/publicar` (API-ADM-CIC-005). */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/ciclos/compartilhado';
import { PublicarCicloBodySchema, publicarCiclo } from '@/server/ciclos/publicar';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const POST = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  body: PublicarCicloBodySchema,
  params: ParamsSchema,
  handler: async ({ body, params, ator, ctx }) => publicarCiclo(obterPrisma(), params.id, body, ator, ctx),
});
