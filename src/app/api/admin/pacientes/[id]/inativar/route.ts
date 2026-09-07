/**
 * API-ADM-PAC-004 — `POST /api/admin/pacientes/:id/inativar`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { inativarPaciente } from '@/server/services/pacientes/pacientes';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({ motivo: z.string().trim().min(1) }).strict();

export const POST = defineHandler({
  ator: 'ADMIN',
  params: ParamsSchema,
  body: BodySchema,
  handler: async ({ params, body, ator, ctx }) => {
    const prisma = await obterPrisma();
    return inativarPaciente(prisma, params.id, body.motivo, ator.adminId, ctx);
  },
});
