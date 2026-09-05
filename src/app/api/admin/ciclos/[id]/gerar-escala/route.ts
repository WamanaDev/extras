/** `POST /api/admin/ciclos/:id/gerar-escala` (API-ADM-CIC-003). */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/ciclos/compartilhado';
import { gerarEscala } from '@/server/ciclos/gerar-escala';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const POST = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  params: ParamsSchema,
  handler: async ({ params, ator, ctx }) => gerarEscala(obterPrisma(), params.id, ator, ctx),
});
