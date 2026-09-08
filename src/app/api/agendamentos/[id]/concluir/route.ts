/**
 * API-AGE-005 — `POST /api/agendamentos/:id/concluir`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { concluirAgendamentoNaRt } from '@/server/services/pacientes/agendamentos';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';
import { broadcastPacientes } from '@/server/realtime/broadcast-pacientes';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z
  .object({
    status: z.enum(['REALIZADO', 'NAO_COMPARECEU']),
    observacoes: z.string().trim().optional(),
  })
  .strict();

export const POST = defineHandler({
  ator: 'COLABORADOR',
  params: ParamsSchema,
  body: BodySchema,
  handler: async ({ params, body, ator, ctx }) => {
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    const agendamento = await concluirAgendamentoNaRt(prisma, params.id, rtId, body.status, body.observacoes, { tipo: 'COLABORADOR', colaboradorId: ator.colaboradorId }, ctx);

    await broadcastPacientes(rtId, 'agendamento:atualizado', { agendamentoId: params.id, campos: ['status'] });

    return agendamento;
  },
});
