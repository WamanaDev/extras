/**
 * API-ADM-REL-001 — `GET /api/admin/relatorios/ciclo/:id`.
 *
 * Só faz o wiring de `defineHandler` (`API-000`) sobre `montarRelatorioCiclo`
 * (`@/server/relatorios/ciclo.ts`) — nenhuma regra aqui. `cache: 'pessoal'`
 * (`private, no-store`, `contrato-comum.md`): dado agregado mas sensível
 * (nome/matrícula/horas por colaborador), nunca cache compartilhado.
 *
 * "D: roda no role `app_readonly`" — `obterPrismaRelatoriosReadonly`
 * (`@/server/relatorios/prisma-cliente.ts`) usa `DATABASE_URL_READONLY`
 * quando configurada (ver GAP documentado nesse módulo em `_conflitos.md`).
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrismaRelatoriosReadonly } from '@/server/relatorios/prisma-cliente';
import { montarRelatorioCiclo } from '@/server/relatorios/ciclo';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const GET = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'leitura_por_sessao' },
  params: ParamsSchema,
  cache: 'pessoal',
  handler: async ({ params }) => {
    const prisma = await obterPrismaRelatoriosReadonly();
    return montarRelatorioCiclo(prisma, params.id);
  },
});
