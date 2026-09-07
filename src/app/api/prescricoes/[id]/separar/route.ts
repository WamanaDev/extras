/**
 * API-MED-005 — `POST /api/prescricoes/:id/separar`. 1ª etapa da checagem
 * dupla (RNP-25).
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { separarMedicamento } from '@/server/services/pacientes/medicamentos';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';
import { broadcastPacientes } from '@/server/realtime/broadcast-pacientes';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({ horarioPrevisto: z.string().datetime({ offset: true }).optional() }).strict();

export const POST = defineHandler({
  ator: 'COLABORADOR',
  params: ParamsSchema,
  body: BodySchema,
  statusSucesso: 201,
  handler: async ({ params, body, ator, ctx }) => {
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    const administracao = await separarMedicamento(prisma, params.id, rtId, ator.colaboradorId, body.horarioPrevisto, ctx);

    await broadcastPacientes(rtId, 'medicacao:separada', { administracaoId: administracao.id });

    return administracao;
  },
});
