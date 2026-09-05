/** `POST /api/admin/ciclos/:id/duplicar` (API-ADM-CIC-007). */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/ciclos/compartilhado';
import { DuplicarCicloBodySchema, duplicarCiclo } from '@/server/ciclos/duplicar';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const POST = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  body: DuplicarCicloBodySchema,
  params: ParamsSchema,
  statusSucesso: 201,
  handler: async ({ body, params, ator, ctx }) => duplicarCiclo(obterPrisma(), params.id, body, ator, ctx),
});
