/**
 * API-MED-007 — `GET /api/medicamentos/alertas`.
 */
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { alertasMedicamento } from '@/server/services/pacientes/medicamentos';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';

export const GET = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: { escopo: 'leitura_por_sessao' },
  cache: 'grade-extras',
  handler: async ({ ator }) => {
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    return alertasMedicamento(prisma, rtId, 30);
  },
});
