/**
 * Preparação de infra de Web Push — `enviarPushParaColaborador`.
 *
 * Mesmo padrão defensivo de `src/server/realtime/broadcast.ts` (leia aquele
 * arquivo primeiro): nunca lança, best-effort, log via `redigirParaLog`.
 *
 * **Ainda não há gatilho de negócio chamando isto.** Este módulo só existe
 * para que uma etapa futura (nova extra disponível, escala publicada, etc.)
 * tenha a infra pronta e testável — ver `./criar.ts` para o ponto de entrada
 * que features futuras vão chamar.
 *
 * Se `VAPID_PRIVATE_KEY`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_SUBJECT` não
 * estiverem configuradas (ainda não geramos as chaves reais — ver
 * `src/env.ts`), a função loga um aviso único (não a cada chamada, para não
 * poluir o log) e não faz nada. Nenhuma parte do app trava por causa disso.
 */
import webpush from 'web-push';
import type { PrismaClient } from '@prisma/client';
import { redigirParaLog } from '@/server/log/redact';
import { env } from '@/env';

export type ClientePush = Pick<PrismaClient, 'pushSubscription'>;

export interface PayloadPush {
  titulo: string;
  mensagem: string;
  link?: string;
}

let avisoVapidAusenteJaLogado = false;
let vapidConfigurado = false;

/**
 * Configura o `webpush` com as chaves VAPID uma única vez (idempotente —
 * chamadas seguintes são no-op). Retorna `false` sem configurar nada quando
 * alguma das três variáveis está ausente.
 */
function garantirVapidConfigurado(): boolean {
  if (vapidConfigurado) return true;

  const { VAPID_PRIVATE_KEY, VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY } = env;
  if (!VAPID_PRIVATE_KEY || !VAPID_SUBJECT || !NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    if (!avisoVapidAusenteJaLogado) {
      avisoVapidAusenteJaLogado = true;
      // eslint-disable-next-line no-console
      console.warn(
        redigirParaLog({
          msg: 'push desabilitado — VAPID_PRIVATE_KEY/VAPID_SUBJECT/NEXT_PUBLIC_VAPID_PUBLIC_KEY não configuradas',
        }),
      );
    }
    return false;
  }

  webpush.setVapidDetails(VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigurado = true;
  return true;
}

/** Status HTTP que a Web Push API usa para indicar subscription expirada/inválida — limpeza automática (comportamento padrão de Web Push). */
const STATUS_SUBSCRIPTION_INVALIDA = new Set([404, 410]);

/**
 * Envia push para todas as subscriptions do colaborador. Best-effort: nunca
 * lança — falha de push é pior tarde do que pior a mutação de negócio que a
 * chamou (mesma filosofia de `broadcast()`). Subscriptions que retornarem
 * 404/410 são apagadas do banco (expiradas/inválidas).
 */
export async function enviarPushParaColaborador(
  prisma: ClientePush,
  colaboradorId: string,
  payload: PayloadPush,
): Promise<void> {
  try {
    if (!garantirVapidConfigurado()) return;

    const subscriptions = await prisma.pushSubscription.findMany({ where: { colaboradorId } });
    if (subscriptions.length === 0) return;

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            JSON.stringify(payload),
          );
        } catch (erro) {
          const statusCode = (erro as { statusCode?: number } | undefined)?.statusCode;
          if (statusCode !== undefined && STATUS_SUBSCRIPTION_INVALIDA.has(statusCode)) {
            await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => undefined);
            return;
          }
          // eslint-disable-next-line no-console
          console.error(
            redigirParaLog({ msg: 'falha ao enviar push', colaboradorId, endpoint: subscription.endpoint, erro: String(erro) }),
          );
        }
      }),
    );
  } catch (erro) {
    // eslint-disable-next-line no-console
    console.error(redigirParaLog({ msg: 'falha ao enviar push para colaborador', colaboradorId, erro: String(erro) }));
  }
}
