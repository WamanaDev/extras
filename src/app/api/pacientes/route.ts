/**
 * API-PAC-001 — `GET /api/pacientes`. Lista pacientes ativos da própria RT
 * do colaborador (RNP-01) — nunca aceita `rtId` do cliente.
 */
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { listarPacientesRt } from '@/server/services/pacientes/pacientes';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';

export const GET = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: { escopo: 'leitura_por_sessao' },
  cache: 'pessoal',
  handler: async ({ ator }) => {
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    return { itens: await listarPacientesRt(prisma, rtId) };
  },
});
