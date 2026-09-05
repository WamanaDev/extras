/**
 * `POST /api/notificacoes/marcar-todas-lidas` — marca todas as não lidas do
 * colaborador da sessão como lidas.
 */
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { marcarTodasNotificacoesComoLidas } from '@/server/notificacoes/marcar-todas-lidas';

export const POST = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: {
    escopo: 'marcacoes_por_sessao',
    identificador: ({ request }) => request.cookies.get('sessao_colaborador')?.value ?? 'anon',
  },
  handler: async ({ ator, ctx }) => {
    const prisma = await obterPrisma();
    await marcarTodasNotificacoesComoLidas(prisma, ator.colaboradorId, ctx.agora);
  },
});
