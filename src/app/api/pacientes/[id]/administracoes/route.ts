/**
 * API-MED-006 — `GET /api/pacientes/:id/administracoes`. Parâmetro `id`
 * (não `pacienteId`) — Next.js exige o mesmo nome de slug em toda rota
 * dinâmica irmã sob `api/pacientes/*` (`[id]` já usado por
 * `GET /api/pacientes/:id`).
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { listarAdministracoes } from '@/server/services/pacientes/medicamentos';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';

const ParamsSchema = z.object({ id: z.string().uuid() });

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const QuerySchema = z.object({
  de: z.string().date().optional(),
  ate: z.string().date().optional(),
});

export const GET = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: { escopo: 'leitura_por_sessao' },
  params: ParamsSchema,
  query: QuerySchema,
  cache: 'pessoal',
  handler: async ({ params, query, ator }) => {
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    const hoje = hojeISO();
    return listarAdministracoes(prisma, params.id, rtId, query.de ?? hoje, query.ate ?? hoje);
  },
});
