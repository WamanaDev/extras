/**
 * `salvarPushSubscription` / `removerPushSubscription` — `POST`/`DELETE
 * /api/push/subscribe`.
 *
 * Formato de entrada é o de `PushSubscription.toJSON()` do browser:
 * `{ endpoint, keys: { p256dh, auth } }`. Upsert por `endpoint` (a Web Push
 * API usa a própria URL do endpoint como identificador único da
 * subscription — `@unique` no schema).
 */
import type { PrismaClient } from '@prisma/client';

export type ClientePushSubscription = Pick<PrismaClient, 'pushSubscription'>;

export interface EntradaPushSubscription {
  colaboradorId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

export async function salvarPushSubscription(prisma: ClientePushSubscription, entrada: EntradaPushSubscription): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: entrada.endpoint },
    // Reassocia ao colaborador atual mesmo se o endpoint já existia associado
    // a outro colaborador (troca de conta no mesmo navegador/dispositivo).
    update: {
      colaboradorId: entrada.colaboradorId,
      p256dh: entrada.p256dh,
      auth: entrada.auth,
      userAgent: entrada.userAgent ?? null,
    },
    create: {
      colaboradorId: entrada.colaboradorId,
      endpoint: entrada.endpoint,
      p256dh: entrada.p256dh,
      auth: entrada.auth,
      userAgent: entrada.userAgent ?? null,
    },
  });
}

/**
 * Remove a subscription pelo `endpoint`, só se pertencer ao colaborador da
 * sessão — nunca deixa um colaborador apagar a subscription de outro. Não
 * lança se não encontrar (idempotente: desativar push de algo já removido não é erro).
 */
export async function removerPushSubscription(prisma: ClientePushSubscription, colaboradorId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { colaboradorId, endpoint } });
}
