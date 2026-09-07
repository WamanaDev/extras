/**
 * `POST /api/admin/solicitacoes-cancelamento/:id/recusar` — pedido do
 * usuário: QUALQUER admin recusa o pedido de cancelamento. Nunca toca a
 * marcação (continua `CONFIRMADA`) — ver
 * `@/server/services/solicitacoes-cancelamento`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { recusarSolicitacaoCancelamento } from '@/server/services/solicitacoes-cancelamento';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({
  // Obrigatório — é o que explica pro colaborador por que o pedido não foi aceito.
  motivoResolucao: z.string().trim().min(1, 'Motivo é obrigatório.'),
});

export const POST = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'marcacoes_por_sessao' },
  params: ParamsSchema,
  body: BodySchema,
  handler: async ({ ator, params, body, ctx }) => {
    const prisma = await obterPrisma();
    return recusarSolicitacaoCancelamento(prisma, {
      solicitacaoId: params.id,
      adminId: ator.adminId,
      motivoResolucao: body.motivoResolucao,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  },
});
