/**
 * `POST /api/notificacoes/:id/marcar-lida` — marca uma notificação como lida.
 * Só se pertencer ao colaborador da sessão (`marcarNotificacaoComoLida` já
 * garante isso via `WHERE colaboradorId = ...` — 404 uniforme se não achar).
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { marcarNotificacaoComoLida } from '@/server/notificacoes/marcar-lida';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const POST = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: {
    escopo: 'marcacoes_por_sessao',
    identificador: ({ request }) => request.cookies.get('sessao_colaborador')?.value ?? 'anon',
  },
  params: ParamsSchema,
  handler: async ({ ator, params, ctx }) => {
    const prisma = await obterPrisma();
    await marcarNotificacaoComoLida(prisma, params.id, ator.colaboradorId, ctx.agora);
  },
});
