/**
 * API-MED-008 — `POST /api/administracoes/:id/conferir`. 2ª etapa (RNP-26).
 * `colaboradorId` só da sessão — "quem separou" é decidido pelo servidor
 * (`FN-015`), nunca aceito do cliente.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { conferirMedicamento } from '@/server/services/pacientes/medicamentos';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({ confere: z.boolean(), observacao: z.string().trim().optional() }).strict();

export const POST = defineHandler({
  ator: 'COLABORADOR',
  params: ParamsSchema,
  body: BodySchema,
  handler: async ({ params, body, ator, ctx }) => {
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    return conferirMedicamento(prisma, params.id, rtId, ator.colaboradorId, body.confere, body.observacao, ctx);
  },
});
