/**
 * API-ADM-CIC-002 — testes de aceitação com Prisma mockado.
 *
 * Concorrência real (F1-3: "dois requests concorrentes: um cria, outro 409")
 * depende de duas conexões Postgres simultâneas batendo na mesma constraint
 * — não reproduzível com um mock em processo único. Coberto aqui pelo
 * equivalente determinístico: `tx.ciclo.create` rejeitando com o erro que a
 * constraint `ciclo_unico` produziria, que é exatamente o que o segundo
 * request concorrente veria (mesmo padrão de `tx.test.ts`, que marca os
 * cenários T1–T10 de concorrência real como pendentes de infraestrutura).
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
const ADMIN: AtorAdmin = { tipo: 'ADMIN', adminId: 'admin-1', email: 'admin@exemplo.com' };

function criarPrismaFake(cicloCreate: ReturnType<typeof vi.fn>): PrismaClient {
  const tx = { ciclo: { create: cicloCreate } };
  return {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaClient;
}

describe('CriarCicloBodySchema (validação, F2-4/F2-5/F2-6)', () => {
  it('mes = 13 é rejeitado (422)', async () => {
    const { CriarCicloBodySchema } = await import('./criar');
    const resultado = CriarCicloBodySchema.safeParse({ ano: 2026, mes: 13, limitePadrao: 4 });
    expect(resultado.success).toBe(false);
  });

  it('maxBlocosSeguidos = 3 sem justificativa é rejeitado', async () => {
    const { CriarCicloBodySchema } = await import('./criar');
    const resultado = CriarCicloBodySchema.safeParse({ ano: 2026, mes: 9, limitePadrao: 4, maxBlocosSeguidos: 3 });
    expect(resultado.success).toBe(false);
  });

  it('maxBlocosSeguidos = 3 com justificativa passa', async () => {
    const { CriarCicloBodySchema } = await import('./criar');
    const resultado = CriarCicloBodySchema.safeParse({
      ano: 2026,
      mes: 9,
      limitePadrao: 4,
      maxBlocosSeguidos: 3,
      justificativa: 'RT com efetivo reduzido neste mês.',
    });
    expect(resultado.success).toBe(true);
  });

  it('abertura depois do fechamento é rejeitada', async () => {
    const { CriarCicloBodySchema } = await import('./criar');
    const resultado = CriarCicloBodySchema.safeParse({
      ano: 2026,
      mes: 9,
      limitePadrao: 4,
      aberturaMarcacao: '2026-09-10T00:00:00-03:00',
      fechamentoMarcacao: '2026-09-01T00:00:00-03:00',
    });
    expect(resultado.success).toBe(false);
  });
});

describe('criarCiclo (F2-1/F2-2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria o ciclo em RASCUNHO e audita CICLO_CRIADO', async () => {
    const { criarCiclo } = await import('./criar');
    const cicloCriado = {
      id: 'ciclo-1',
      ano: 2026,
      mes: 9,
      status: 'RASCUNHO',
      limitePadrao: 4,
      permiteCruzada: true,
      permiteExtraEmFolga: false,
      maxBlocosSeguidos: 2,
      aberturaMarcacao: null,
      fechamentoMarcacao: null,
    };
    const cicloCreate = vi.fn().mockResolvedValue(cicloCriado);
    const prisma = criarPrismaFake(cicloCreate);
    const { registrarAuditoria } = await import('@/server/audit/registrar');

    const resultado = await criarCiclo(prisma, { ano: 2026, mes: 9, limitePadrao: 4 }, ADMIN, CTX);

    expect(resultado.status).toBe('RASCUNHO');
    expect(resultado.id).toBe('ciclo-1');
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ acao: 'CICLO_CRIADO', atorId: 'admin-1', entidade: 'ciclo', entidadeId: 'ciclo-1' }),
    );
  });

  it('duplicado (mesmo ano/mês) vira CICLO_JA_EXISTE 409, via violação da constraint ciclo_unico', async () => {
    const { criarCiclo } = await import('./criar');
    const erroUnicidade = { code: '23505', meta: { constraint: 'ciclo_unico' } };
    const cicloCreate = vi.fn().mockRejectedValue(erroUnicidade);
    const prisma = criarPrismaFake(cicloCreate);

    await expect(criarCiclo(prisma, { ano: 2026, mes: 9, limitePadrao: 4 }, ADMIN, CTX)).rejects.toMatchObject({
      status: 409,
      codigo: 'CICLO_JA_EXISTE',
    });
  });

  it('erro de constraint diferente de ciclo_unico não é mascarado como CICLO_JA_EXISTE', async () => {
    const { criarCiclo } = await import('./criar');
    const outroErro = { code: '23505', meta: { constraint: 'outra_constraint' } };
    const cicloCreate = vi.fn().mockRejectedValue(outroErro);
    const prisma = criarPrismaFake(cicloCreate);

    await expect(criarCiclo(prisma, { ano: 2026, mes: 9, limitePadrao: 4 }, ADMIN, CTX)).rejects.toBe(outroErro);
  });
});
