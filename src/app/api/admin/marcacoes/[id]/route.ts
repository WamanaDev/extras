/**
 * API-ADM-MAR-003 — `DELETE /api/admin/marcacoes/:id`.
 *
 * Wiring de `defineHandler` sobre `@/server/services/marcacoes-admin` — a
 * lógica de negócio (advisory lock, checagem de ciclo `FECHADO`,
 * idempotência) vive inteira em `cancelar_extra` (FN-006); este arquivo só
 * valida `motivo` e traduz params/ctx.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { cancelarExtraAdmin } from '@/server/services/marcacoes-admin';

const ParamsSchema = z.object({ id: z.string().uuid() });

const CancelarBodySchema = z.object({
  // Obrigatório (API-ADM-MAR-003, "R"): cancelar plantão de alguém sem
  // registro vira palavra contra palavra.
  motivo: z.string().trim().min(1, 'Motivo é obrigatório.'),
});

export const DELETE = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'marcacoes_por_sessao' },
  params: ParamsSchema,
  body: CancelarBodySchema,
  handler: async ({ ator, params, body, ctx }) => {
    const prisma = await obterPrisma();
    return cancelarExtraAdmin(prisma, {
      marcacaoId: params.id,
      motivo: body.motivo,
      adminId: ator.adminId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  },
});
