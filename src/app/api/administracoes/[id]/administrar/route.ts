/**
 * API-MED-009 — `POST /api/administracoes/:id/administrar`. 3ª etapa
 * (RNP-27) — só separador ou conferente, decidido pelo servidor (`FN-016`).
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { administrarMedicamento } from '@/server/services/pacientes/medicamentos';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';
import { broadcastPacientes } from '@/server/realtime/broadcast-pacientes';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z
  .object({ status: z.enum(['ADMINISTRADO', 'RECUSADO']), observacao: z.string().trim().optional() })
  .strict();

export const POST = defineHandler({
  ator: 'COLABORADOR',
  params: ParamsSchema,
  body: BodySchema,
  handler: async ({ params, body, ator, ctx }) => {
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    const resultado = await administrarMedicamento(prisma, params.id, rtId, ator.colaboradorId, body.status, body.observacao, ctx);

    await broadcastPacientes(rtId, 'medicacao:administrada', { administracaoId: params.id });

    return resultado;
  },
});
