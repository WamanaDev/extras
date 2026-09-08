/**
 * API-AGE-004 — `POST /api/agendamentos/:id/cancelar`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { cancelarAgendamento, verificarPermissaoEdicao } from '@/server/services/pacientes/agendamentos';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';
import { erroNaoEncontrado } from '@/server/http/erros';
import { broadcastPacientes } from '@/server/realtime/broadcast-pacientes';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({ motivo: z.string().trim().min(1) }).strict();

export const POST = defineHandler({
  ator: 'COLABORADOR',
  params: ParamsSchema,
  body: BodySchema,
  handler: async ({ params, body, ator, ctx }) => {
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    const atual = await prisma.agendamento.findFirst({ where: { id: params.id, rtId } });
    if (!atual) throw erroNaoEncontrado('Agendamento não encontrado.');
    verificarPermissaoEdicao(atual, { tipo: 'COLABORADOR', colaboradorId: ator.colaboradorId });

    const agendamento = await cancelarAgendamento(prisma, params.id, body.motivo, { colaboradorId: ator.colaboradorId }, ctx);

    await broadcastPacientes(rtId, 'agendamento:cancelado', { agendamentoId: params.id });

    return agendamento;
  },
});
