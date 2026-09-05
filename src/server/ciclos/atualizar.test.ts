/**
 * API-ADM-CIC-004 — testes de aceitação com Prisma mockado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AtorAdmin, ContextoRequisicao } from '@/server/http/handler';

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn().mockResolvedValue({ id: 'audit-1', hash: 'hash-1' }),
}));

const CTX: ContextoRequisicao = {
  requestId: 'req-1',
  ip: '10.0.0.1',
  userAgent: 'vitest',
  agora: new Date('2026-09-03T10:00:00-03:00'),
  idempotencyKey: null,
};
const ADMIN: AtorAdmin = { tipo: 'ADMIN', adminId: 'admin-1', email: null };

const CICLO_ROW_BASE = {
  id: 'ciclo-1',
  ano: 2026,
  mes: 9,
  status: 'RASCUNHO',
  limite_padrao: 6,
  permite_cruzada: true,
  permite_extra_em_folga: false,
  max_blocos_seguidos: 2,
  abertura_marcacao: null,
  fechamento_marcacao: null,
};

function criarPrismaFake(queryRawSequencia: unknown[][], cicloAtualizado: Record<string, unknown>): PrismaClient {
  const queryRaw = vi.fn();
  for (const resultado of queryRawSequencia) queryRaw.mockResolvedValueOnce(resultado);
  const tx = {
    $queryRaw: queryRaw,
    ciclo: { update: vi.fn().mockResolvedValue(cicloAtualizado) },
  };
  return {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaClient;
}

describe('atualizarCiclo (F4-1..F4-6)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aumentar limite aplica direto, sem checar impacto', async () => {
    const { atualizarCiclo } = await import('./atualizar');
    const prisma = criarPrismaFake(
      [[CICLO_ROW_BASE]],
      { ...CICLO_ROW_BASE, limitePadrao: 8, permiteCruzada: true, permiteExtraEmFolga: false, maxBlocosSeguidos: 2, aberturaMarcacao: null, fechamentoMarcacao: null },
    );

    const resultado = await atualizarCiclo(prisma, 'ciclo-1', { limitePadrao: 8 }, ADMIN, CTX);

    expect(resultado.ciclo.limitePadrao).toBe(8);
    expect(resultado.impacto).toEqual({ reducaoLimite: [], cruzadaDesligada: [] });
  });

  it('reduzir limite abaixo do já usado, sem confirmar, devolve IMPACTO_NAO_CONFIRMADO com os nomes', async () => {
    const { atualizarCiclo } = await import('./atualizar');
    const afetado = { colaboradorId: 'colab-1', nome: 'Fulano', matricula: '0001' };
    const prisma = criarPrismaFake([[CICLO_ROW_BASE], [afetado]], {});

    const erro = await atualizarCiclo(prisma, 'ciclo-1', { limitePadrao: 2 }, ADMIN, CTX).catch((e) => e);

    expect(erro).toMatchObject({ status: 409, codigo: 'IMPACTO_NAO_CONFIRMADO' });
    expect(erro.detalhes).toHaveProperty('reducaoLimite.colab-1');
  });

  it('mesma chamada com confirmarImpacto: true aplica (marcações mantidas — a função não as toca)', async () => {
    const { atualizarCiclo } = await import('./atualizar');
    const afetado = { colaboradorId: 'colab-1', nome: 'Fulano', matricula: '0001' };
    const prisma = criarPrismaFake(
      [[CICLO_ROW_BASE], [afetado]],
      { ...CICLO_ROW_BASE, limitePadrao: 2, permiteCruzada: true, permiteExtraEmFolga: false, maxBlocosSeguidos: 2, aberturaMarcacao: null, fechamentoMarcacao: null },
    );

    const resultado = await atualizarCiclo(prisma, 'ciclo-1', { limitePadrao: 2, confirmarImpacto: true }, ADMIN, CTX);

    expect(resultado.ciclo.limitePadrao).toBe(2);
    expect(resultado.impacto.reducaoLimite).toEqual([afetado]);
    const { registrarAuditoria } = await import('@/server/audit/registrar');
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ acao: 'LIMITE_ALTERADO', payload: expect.objectContaining({ antes: 6, depois: 2 }) }),
    );
  });

  it('desligar cruzada com marcações cruzadas existentes lista o impacto', async () => {
    const { atualizarCiclo } = await import('./atualizar');
    const afetado = { colaboradorId: 'colab-2', nome: 'Ciclana', matricula: '0002' };
    const prisma = criarPrismaFake([[CICLO_ROW_BASE], [afetado]], {});

    const erro = await atualizarCiclo(prisma, 'ciclo-1', { permiteCruzada: false }, ADMIN, CTX).catch((e) => e);

    expect(erro).toMatchObject({ status: 409, codigo: 'IMPACTO_NAO_CONFIRMADO' });
    expect(erro.detalhes).toHaveProperty('cruzadaDesligada.colab-2');
  });

  it('ciclo fechado não pode ser alterado', async () => {
    const { atualizarCiclo } = await import('./atualizar');
    const prisma = criarPrismaFake([[{ ...CICLO_ROW_BASE, status: 'FECHADO' }]], {});

    await expect(atualizarCiclo(prisma, 'ciclo-1', { limitePadrao: 2 }, ADMIN, CTX)).rejects.toMatchObject({
      status: 409,
      codigo: 'CICLO_FECHADO',
    });
  });

  it('ciclo inexistente vira 404', async () => {
    const { atualizarCiclo } = await import('./atualizar');
    const prisma = criarPrismaFake([[]], {});

    await expect(atualizarCiclo(prisma, 'ciclo-x', { limitePadrao: 2 }, ADMIN, CTX)).rejects.toMatchObject({
      status: 404,
    });
  });
});
