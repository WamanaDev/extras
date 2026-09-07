/**
 * API-MED-003 — `PATCH /api/prescricoes/:id`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { atualizarPrescricao } from '@/server/services/pacientes/medicamentos';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z
  .object({
    dose: z.string().trim().min(1).optional(),
    via: z.string().trim().min(1).optional(),
    instrucoes: z.string().trim().optional(),
  })
  .strict();

export const PATCH = defineHandler({
  ator: 'QUALQUER',
  params: ParamsSchema,
  body: BodySchema,
  handler: async ({ params, body, ator, ctx }) => {
    const prisma = await obterPrisma();
    if (ator.tipo === 'COLABORADOR') {
      const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
      return atualizarPrescricao(prisma, params.id, rtId, body, { colaboradorId: ator.colaboradorId }, ctx);
    }
    return atualizarPrescricao(prisma, params.id, null, body, { adminId: ator.adminId }, ctx);
  },
});
