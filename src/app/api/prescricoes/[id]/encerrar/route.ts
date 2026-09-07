/**
 * API-MED-004 — `POST /api/prescricoes/:id/encerrar`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { encerrarPrescricao } from '@/server/services/pacientes/medicamentos';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z
  .object({ novoStatus: z.enum(['SUSPENSA', 'ENCERRADA']), motivo: z.string().trim().min(1) })
  .strict();

export const POST = defineHandler({
  ator: 'QUALQUER',
  params: ParamsSchema,
  body: BodySchema,
  handler: async ({ params, body, ator, ctx }) => {
    const prisma = await obterPrisma();
    if (ator.tipo === 'COLABORADOR') {
      const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
      return encerrarPrescricao(prisma, params.id, rtId, body.novoStatus, body.motivo, { colaboradorId: ator.colaboradorId }, ctx);
    }
    return encerrarPrescricao(prisma, params.id, null, body.novoStatus, body.motivo, { adminId: ator.adminId }, ctx);
  },
});
