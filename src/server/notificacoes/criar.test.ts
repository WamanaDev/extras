/**
 * Testes de `criarNotificacao` — insere a notificação e chama
 * `enviarPushParaColaborador` (mockado) como best-effort, nunca falhando a
 * criação por causa de push.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const enviarPushMock = vi.fn();
vi.mock('./push', () => ({
  enviarPushParaColaborador: (...args: unknown[]) => enviarPushMock(...args),
}));

import { criarNotificacao, type ClienteNotificacao } from './criar';

function criarPrismaFake(notificacaoCriada: Record<string, unknown> = {}): ClienteNotificacao {
  return {
    notificacao: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'notif-1',
        lida: false,
        lidaEm: null,
        criadoEm: new Date('2026-01-01T00:00:00Z'),
        ...data,
        ...notificacaoCriada,
      })),
    },
  } as unknown as ClienteNotificacao;
}

describe('criarNotificacao', () => {
  beforeEach(() => {
    enviarPushMock.mockReset();
    enviarPushMock.mockResolvedValue(undefined);
  });

  it('insere a notificação com os campos informados', async () => {
    const prisma = criarPrismaFake();
    const resultado = await criarNotificacao(prisma, {
      colaboradorId: 'colab-1',
      tipo: 'PLANTAO_DISPONIVEL',
      titulo: 'Nova extra disponível',
      mensagem: 'Há uma nova extra disponível na sua unidade.',
      link: '/plantoes',
    });

    expect(prisma.notificacao.create).toHaveBeenCalledWith({
      data: {
        colaboradorId: 'colab-1',
        tipo: 'PLANTAO_DISPONIVEL',
        titulo: 'Nova extra disponível',
        mensagem: 'Há uma nova extra disponível na sua unidade.',
        link: '/plantoes',
      },
    });
    expect(resultado.id).toBe('notif-1');
  });

  it('link omitido vira null', async () => {
    const prisma = criarPrismaFake();
    await criarNotificacao(prisma, {
      colaboradorId: 'colab-1',
      tipo: 'ESCALA_PUBLICADA',
      titulo: 'Escala publicada',
      mensagem: 'A escala do ciclo foi publicada.',
    });

    expect(prisma.notificacao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ link: null }) }),
    );
  });

  it('chama enviarPushParaColaborador com o mesmo título/mensagem/link', async () => {
    const prisma = criarPrismaFake();
    await criarNotificacao(prisma, {
      colaboradorId: 'colab-1',
      tipo: 'PLANTAO_DISPONIVEL',
      titulo: 'Título',
      mensagem: 'Mensagem',
      link: '/plantoes',
    });

    expect(enviarPushMock).toHaveBeenCalledWith(prisma, 'colab-1', {
      titulo: 'Título',
      mensagem: 'Mensagem',
      link: '/plantoes',
    });
  });

  it('falha do push nunca derruba a criação da notificação (best-effort)', async () => {
    enviarPushMock.mockRejectedValueOnce(new Error('push indisponível'));
    const prisma = criarPrismaFake();

    await expect(
      criarNotificacao(prisma, {
        colaboradorId: 'colab-1',
        tipo: 'PLANTAO_DISPONIVEL',
        titulo: 'Título',
        mensagem: 'Mensagem',
      }),
    ).resolves.toMatchObject({ id: 'notif-1' });
  });
});
