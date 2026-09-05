/**
 * API-ADM-CIC-006 — testes de aceitação com Prisma mockado.
 *
 * F6-3 ("marcar após fechar") e F6-4 ("cancelar após fechar") exercitam
 * `marcar_extra`/`cancelar_extra` (FN-005/FN-006, RN-25) recusando um ciclo
 * `FECHADO` — comportamento de `API-ADM-MAR-002`/`003`, não desta rota.
 * `fecharCiclo` só produz a transição; a imutabilidade pós-fechamento é
 * testada onde a escrita é de fato tentada (testes de marcação).
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

function criarPrismaFake(opts: {
  cicloRow: Record<string, unknown> | undefined;
  agregados?: { colaboradores: bigint; extras: bigint; horas: bigint };
  cobertura?: Array<{ deficit: number }>;
  cicloAtualizado?: Record<string, unknown>;
}): PrismaClient {
  const queryRaw = vi.fn();
  queryRaw.mockResolvedValueOnce(opts.cicloRow ? [opts.cicloRow] : []); // buscarCicloParaFechar (FOR UPDATE)
  queryRaw.mockResolvedValueOnce([opts.agregados ?? { colaboradores: 0n, extras: 0n, horas: 0n }]); // montarResumo: agregados
  queryRaw.mockResolvedValueOnce(opts.cobertura ?? []); // montarResumo: cobertura_ciclo
  const tx = {
    $queryRaw: queryRaw,
    ciclo: { update: vi.fn().mockResolvedValue(opts.cicloAtualizado ?? { id: 'ciclo-1', status: 'FECHADO' }) },
  };
  return {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaClient;
}

describe('FecharCicloBodySchema', () => {
  it('exige o campo confirmacao', async () => {
    const { FecharCicloBodySchema } = await import('./fechar');
    expect(FecharCicloBodySchema.safeParse({}).success).toBe(false);
    expect(FecharCicloBodySchema.safeParse({ confirmacao: 'FECHAR' }).success).toBe(true);
  });
});

describe('fecharCiclo (F6-1/F6-2/F6-5/F6-6)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fechamento válido: PUBLICADO → FECHADO, com resumo', async () => {
    const { fecharCiclo } = await import('./fechar');
    const prisma = criarPrismaFake({
      cicloRow: { id: 'ciclo-1', status: 'PUBLICADO' },
      agregados: { colaboradores: 12n, extras: 20n, horas: 160n },
      cobertura: [{ deficit: 3 }, { deficit: 0 }],
    });

    const resultado = await fecharCiclo(prisma, 'ciclo-1', { confirmacao: 'FECHAR' }, ADMIN, CTX);

    expect(resultado.ciclo.status).toBe('FECHADO');
    expect(resultado.resumo).toEqual({ colaboradores: 12, extras: 20, horas: 160, deficits: 3 });
  });

  it('confirmação errada devolve CONFIRMACAO_INVALIDA (422), sem tocar o banco', async () => {
    const { fecharCiclo } = await import('./fechar');
    const prisma = criarPrismaFake({ cicloRow: { id: 'ciclo-1', status: 'PUBLICADO' } });

    await expect(fecharCiclo(prisma, 'ciclo-1', { confirmacao: 'fechar' }, ADMIN, CTX)).rejects.toMatchObject({
      status: 422,
      codigo: 'CONFIRMACAO_INVALIDA',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ciclo já fechado devolve TRANSICAO_INVALIDA', async () => {
    const { fecharCiclo } = await import('./fechar');
    const prisma = criarPrismaFake({ cicloRow: { id: 'ciclo-1', status: 'FECHADO' } });

    await expect(fecharCiclo(prisma, 'ciclo-1', { confirmacao: 'FECHAR' }, ADMIN, CTX)).rejects.toMatchObject({
      status: 409,
      codigo: 'TRANSICAO_INVALIDA',
    });
  });

  it('ciclo ainda em rascunho (não publicado) também não pode ser fechado', async () => {
    const { fecharCiclo } = await import('./fechar');
    const prisma = criarPrismaFake({ cicloRow: { id: 'ciclo-1', status: 'RASCUNHO' } });

    await expect(fecharCiclo(prisma, 'ciclo-1', { confirmacao: 'FECHAR' }, ADMIN, CTX)).rejects.toMatchObject({
      status: 409,
      codigo: 'TRANSICAO_INVALIDA',
    });
  });

  it('ciclo inexistente vira 404', async () => {
    const { fecharCiclo } = await import('./fechar');
    const prisma = criarPrismaFake({ cicloRow: undefined });

    await expect(fecharCiclo(prisma, 'ciclo-x', { confirmacao: 'FECHAR' }, ADMIN, CTX)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('o resumo gravado na auditoria é exatamente o resumo devolvido na resposta', async () => {
    const { fecharCiclo } = await import('./fechar');
    const prisma = criarPrismaFake({
      cicloRow: { id: 'ciclo-1', status: 'PUBLICADO' },
      agregados: { colaboradores: 5n, extras: 8n, horas: 64n },
      cobertura: [{ deficit: 1 }],
    });

    const resultado = await fecharCiclo(prisma, 'ciclo-1', { confirmacao: 'FECHAR' }, ADMIN, CTX);

    const { registrarAuditoria } = await import('@/server/audit/registrar');
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        acao: 'CICLO_FECHADO',
        entidadeId: 'ciclo-1',
        payload: { resumo: resultado.resumo },
      }),
    );
  });
});
