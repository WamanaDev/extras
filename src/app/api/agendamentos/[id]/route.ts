/**
 * API-AGE-003 — `PATCH /api/agendamentos/:id`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { atualizarAgendamentoNaRt } from '@/server/services/pacientes/agendamentos';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';

const ParamsSchema = z.object({ id: z.string().uuid() });

const AtualizarSchema = z
  .object({
    titulo: z.string().trim().min(1).optional(),
    local: z.string().trim().optional(),
    inicioEm: z.string().datetime({ offset: true }).optional(),
    fimEm: z.string().datetime({ offset: true }).optional(),
    acompanhanteColaboradorId: z.string().uuid().optional(),
    observacoes: z.string().trim().optional(),
    status: z.literal('CONFIRMADO').optional(),
  })
  .strict();

export const PATCH = defineHandler({
  ator: 'COLABORADOR',
  params: ParamsSchema,
  body: AtualizarSchema,
  handler: async ({ params, body, ator, ctx }) => {
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    return atualizarAgendamentoNaRt(prisma, params.id, rtId, body, { tipo: 'COLABORADOR', colaboradorId: ator.colaboradorId }, ctx);
  },
});
