/**
 * `POST /api/admin/solicitacoes-cancelamento/:id/aprovar` — pedido do
 * usuário: QUALQUER admin aprova o pedido de cancelamento (não precisa ser
 * um admin específico). Aprovar chama `cancelar_extra` (FN-006, origem
 * ADMIN) na mesma transação — ver
 * `@/server/services/solicitacoes-cancelamento`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { aprovarSolicitacaoCancelamento } from '@/server/services/solicitacoes-cancelamento';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({ motivoResolucao: z.string().trim().min(1).optional() });

export const POST = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'marcacoes_por_sessao' },
  params: ParamsSchema,
  body: BodySchema,
  handler: async ({ ator, params, body, ctx }) => {
    const prisma = await obterPrisma();
    return aprovarSolicitacaoCancelamento(prisma, {
      solicitacaoId: params.id,
      adminId: ator.adminId,
      motivoResolucao: body.motivoResolucao,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  },
});
