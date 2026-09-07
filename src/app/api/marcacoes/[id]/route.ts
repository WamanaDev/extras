/**
 * API-COL-005 — `DELETE /api/marcacoes/:id`.
 *
 * Pedido do usuário: colaborador não cancela mais a própria extra direto —
 * este endpoint (mesma URL/verbo de antes, pra não exigir mudança na UI que
 * já chama `del()` aqui) agora só ABRE um pedido de cancelamento
 * (`solicitacao_cancelamento`, `PENDENTE`). O cancelamento de fato só
 * acontece quando um admin aprova, em
 * `POST /api/admin/solicitacoes-cancelamento/:id/aprovar`
 * (`@/server/services/solicitacoes-cancelamento`).
 *
 * "DELETE que não deleta nada" é uma escolha deliberada: manter o mesmo
 * verbo/URL evita reescrever os três lugares da UI que já chamam
 * `del('/api/marcacoes/:id')` — só a resposta muda de forma (era
 * `{status:'CANCELADA', saldo}`, agora é `{status:'PENDENTE', jaExistia}`).
 * Wiring de `defineHandler` sobre
 * `@/server/services/colaborador/solicitar-cancelamento` — nenhuma regra de
 * negócio aqui além de validar `motivo`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { solicitarCancelamentoColaborador, type RespostaSolicitarCancelamento } from '@/server/services/colaborador/solicitar-cancelamento';

const ParamsSchema = z.object({ id: z.string().uuid() });

const SolicitarCancelamentoBodySchema = z.object({
  // Obrigatório — é o que o admin vê antes de aprovar ou recusar o pedido.
  motivo: z.string().trim().min(1, 'Motivo é obrigatório.'),
});

export const DELETE = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: {
    escopo: 'marcacoes_por_sessao',
    identificador: ({ request }) => request.cookies.get('sessao_colaborador')?.value ?? 'anon',
  },
  params: ParamsSchema,
  body: SolicitarCancelamentoBodySchema,
  handler: async ({ ator, params, body, ctx }) => {
    const prisma = await obterPrisma();
    const resultado = await solicitarCancelamentoColaborador(prisma, {
      marcacaoId: params.id,
      colaboradorId: ator.colaboradorId,
      motivo: body.motivo,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return resultado satisfies RespostaSolicitarCancelamento;
  },
});
