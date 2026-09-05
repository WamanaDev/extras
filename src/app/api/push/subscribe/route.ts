/**
 * `POST` / `DELETE /api/push/subscribe` — cadastro e remoção de uma
 * subscription de Web Push do colaborador autenticado.
 *
 * Corpo no formato de `PushSubscription.toJSON()` do browser: `{ endpoint,
 * keys: { p256dh, auth } }`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { salvarPushSubscription, removerPushSubscription } from '@/server/notificacoes/push-subscription';

const SubscriptionBodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const POST = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: {
    escopo: 'marcacoes_por_sessao',
    identificador: ({ request }) => request.cookies.get('sessao_colaborador')?.value ?? 'anon',
  },
  body: SubscriptionBodySchema,
  handler: async ({ ator, body, ctx }) => {
    const prisma = await obterPrisma();
    await salvarPushSubscription(prisma, {
      colaboradorId: ator.colaboradorId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: ctx.userAgent,
    });
  },
});

const RemoverBodySchema = z.object({
  endpoint: z.string().url(),
});

export const DELETE = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: {
    escopo: 'marcacoes_por_sessao',
    identificador: ({ request }) => request.cookies.get('sessao_colaborador')?.value ?? 'anon',
  },
  body: RemoverBodySchema,
  handler: async ({ ator, body }) => {
    const prisma = await obterPrisma();
    await removerPushSubscription(prisma, ator.colaboradorId, body.endpoint);
  },
});
