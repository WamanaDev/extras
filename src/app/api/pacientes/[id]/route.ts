/**
 * API-PAC-002 — `GET /api/pacientes/:id`. `404` tanto para inexistente
 * quanto para paciente de outra RT — não vaza existência (`API-000`).
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { obterPacienteRt } from '@/server/services/pacientes/pacientes';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const GET = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: { escopo: 'leitura_por_sessao' },
  params: ParamsSchema,
  cache: 'pessoal',
  handler: async ({ params, ator }) => {
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    return obterPacienteRt(prisma, params.id, rtId);
  },
});
