/**
 * Testes de `enviarNotificacaoEmLote` — filtra `colaboradorId` inexistentes
 * e chama `criarNotificacao` (mockado) uma vez por colaborador válido.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const criarNotificacaoMock = vi.fn();
vi.mock('./criar', () => ({
  criarNotificacao: (...args: unknown[]) => criarNotificacaoMock(...args),
}));

import { enviarNotificacaoEmLote, type ClienteEnviarEmLote } from './enviar-em-lote';

function criarPrismaFake(idsExistentes: string[]): ClienteEnviarEmLote {
  return {
    colaborador: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const solicitados = new Set(where.id.in);
        return idsExistentes.filter((id) => solicitados.has(id)).map((id) => ({ id }));
      }),
    },
  } as unknown as ClienteEnviarEmLote;
}

describe('enviarNotificacaoEmLote', () => {
  beforeEach(() => {
    criarNotificacaoMock.mockReset();
    criarNotificacaoMock.mockResolvedValue({ id: 'notif-x' });
  });

  it('chama criarNotificacao uma vez por colaborador existente', async () => {
    const prisma = criarPrismaFake(['c1', 'c2']);

    const resultado = await enviarNotificacaoEmLote(prisma, {
      colaboradorIds: ['c1', 'c2'],
      titulo: 'Aviso',
      mensagem: 'Mensagem do admin',
    });

    expect(criarNotificacaoMock).toHaveBeenCalledTimes(2);
    expect(criarNotificacaoMock).toHaveBeenCalledWith(prisma, {
      colaboradorId: 'c1',
      tipo: 'ADMIN_MANUAL',
      titulo: 'Aviso',
      mensagem: 'Mensagem do admin',
    });
    expect(resultado).toEqual({ enviadas: 2, colaboradorIds: ['c1', 'c2'] });
  });

  it('ignora colaboradorId que não existe, sem falhar os demais', async () => {
    const prisma = criarPrismaFake(['c1']);

    const resultado = await enviarNotificacaoEmLote(prisma, {
      colaboradorIds: ['c1', 'inexistente'],
      titulo: 'Aviso',
      mensagem: 'Mensagem',
    });

    expect(criarNotificacaoMock).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ enviadas: 1, colaboradorIds: ['c1'] });
  });

  it('deduplica colaboradorId repetido — nunca notifica o mesmo colaborador duas vezes', async () => {
    const prisma = criarPrismaFake(['c1']);

    const resultado = await enviarNotificacaoEmLote(prisma, {
      colaboradorIds: ['c1', 'c1'],
      titulo: 'Aviso',
      mensagem: 'Mensagem',
    });

    expect(criarNotificacaoMock).toHaveBeenCalledTimes(1);
    expect(resultado.enviadas).toBe(1);
  });

  it('passa o link adiante quando informado', async () => {
    const prisma = criarPrismaFake(['c1']);

    await enviarNotificacaoEmLote(prisma, {
      colaboradorIds: ['c1'],
      titulo: 'Aviso',
      mensagem: 'Mensagem',
      link: '/painel',
    });

    expect(criarNotificacaoMock).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ link: '/painel' }),
    );
  });

  it('nenhum colaborador existente → enviadas: 0, sem chamar criarNotificacao', async () => {
    const prisma = criarPrismaFake([]);

    const resultado = await enviarNotificacaoEmLote(prisma, {
      colaboradorIds: ['fantasma'],
      titulo: 'Aviso',
      mensagem: 'Mensagem',
    });

    expect(criarNotificacaoMock).not.toHaveBeenCalled();
    expect(resultado).toEqual({ enviadas: 0, colaboradorIds: [] });
  });
});
