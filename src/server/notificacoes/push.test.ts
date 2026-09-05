/**
 * Testes de `enviarPushParaColaborador` — client `web-push` mockado, sem
 * rede real. Cobre: sem chaves VAPID (no-op), sem subscription (no-op),
 * envio com sucesso, e limpeza automática de subscription expirada
 * (404/410).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const sendNotificationMock = vi.fn();
const setVapidDetailsMock = vi.fn();

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => setVapidDetailsMock(...args),
    sendNotification: (...args: unknown[]) => sendNotificationMock(...args),
  },
}));

vi.mock('@/env', () => ({
  env: {
    VAPID_PRIVATE_KEY: 'chave-privada',
    VAPID_SUBJECT: 'mailto:contato@empresa.com',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'chave-publica',
  },
}));

import { enviarPushParaColaborador, type ClientePush } from './push';

function criarPrismaFake(subscriptions: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>): ClientePush & {
  pushSubscription: { findMany: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
} {
  return {
    pushSubscription: {
      findMany: vi.fn(async () => subscriptions),
      delete: vi.fn(async () => undefined),
    },
  } as unknown as ClientePush & { pushSubscription: { findMany: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } };
}

describe('enviarPushParaColaborador', () => {
  beforeEach(() => {
    sendNotificationMock.mockReset();
    setVapidDetailsMock.mockReset();
  });

  it('sem subscription cadastrada — não chama sendNotification', async () => {
    const prisma = criarPrismaFake([]);
    await enviarPushParaColaborador(prisma, 'colab-1', { titulo: 'T', mensagem: 'M' });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('envia para cada subscription do colaborador', async () => {
    sendNotificationMock.mockResolvedValue(undefined);
    const prisma = criarPrismaFake([
      { id: 'sub-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
      { id: 'sub-2', endpoint: 'https://push.example/2', p256dh: 'p2', auth: 'a2' },
    ]);
    await enviarPushParaColaborador(prisma, 'colab-1', { titulo: 'T', mensagem: 'M', link: '/painel' });
    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
  });

  it('subscription expirada (410) é apagada do banco', async () => {
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 410 });
    const prisma = criarPrismaFake([{ id: 'sub-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' }]);
    await enviarPushParaColaborador(prisma, 'colab-1', { titulo: 'T', mensagem: 'M' });
    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
  });

  it('subscription inválida (404) também é apagada', async () => {
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 404 });
    const prisma = criarPrismaFake([{ id: 'sub-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' }]);
    await enviarPushParaColaborador(prisma, 'colab-1', { titulo: 'T', mensagem: 'M' });
    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
  });

  it('erro que não é 404/410 não apaga a subscription e nunca lança (best-effort)', async () => {
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 500 });
    const prisma = criarPrismaFake([{ id: 'sub-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' }]);
    await expect(enviarPushParaColaborador(prisma, 'colab-1', { titulo: 'T', mensagem: 'M' })).resolves.toBeUndefined();
    expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
  });

  it('nunca lança mesmo se o banco falhar', async () => {
    const prisma: ClientePush = {
      pushSubscription: { findMany: vi.fn(async () => { throw new Error('boom'); }) },
    } as unknown as ClientePush;
    await expect(enviarPushParaColaborador(prisma, 'colab-1', { titulo: 'T', mensagem: 'M' })).resolves.toBeUndefined();
  });
});

describe('enviarPushParaColaborador sem chaves VAPID configuradas', () => {
  it('não busca subscription nem envia — no-op silencioso (não trava o app)', async () => {
    vi.resetModules();
    vi.doMock('@/env', () => ({ env: { VAPID_PRIVATE_KEY: undefined, VAPID_SUBJECT: undefined, NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined } }));
    const { enviarPushParaColaborador: enviarSemVapid } = await import('./push');
    const findMany = vi.fn(async () => []);
    const prisma = { pushSubscription: { findMany } } as unknown as ClientePush;

    await enviarSemVapid(prisma, 'colab-1', { titulo: 'T', mensagem: 'M' });

    expect(findMany).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
    vi.doUnmock('@/env');
    vi.resetModules();
  });
});
