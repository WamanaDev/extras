/**
 * API-ADM-PAC-003 — `PATCH /api/admin/pacientes/:id`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { atualizarPaciente } from '@/server/services/pacientes/pacientes';

const ParamsSchema = z.object({ id: z.string().uuid() });

const AtualizarSchema = z
  .object({
    nome: z.string().trim().min(1).optional(),
    rtId: z.string().uuid().optional(),
    cpf: z.string().trim().optional(),
    nomeResponsavel: z.string().trim().optional(),
    contatoResponsavel: z.string().trim().optional(),
    observacoesClinicas: z.string().trim().optional(),
  })
  .strict();

export const PATCH = defineHandler({
  ator: 'ADMIN',
  params: ParamsSchema,
  body: AtualizarSchema,
  handler: async ({ params, body, ator, ctx }) => {
    const prisma = await obterPrisma();
    return atualizarPaciente(prisma, params.id, body, ator.adminId, ctx);
  },
});
