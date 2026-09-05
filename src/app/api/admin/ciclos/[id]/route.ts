/** `PATCH /api/admin/ciclos/:id` (API-ADM-CIC-004). */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/ciclos/compartilhado';
import { AtualizarCicloBodySchema, atualizarCiclo } from '@/server/ciclos/atualizar';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const PATCH = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  body: AtualizarCicloBodySchema,
  params: ParamsSchema,
  handler: async ({ body, params, ator, ctx }) => atualizarCiclo(obterPrisma(), params.id, body, ator, ctx),
});
