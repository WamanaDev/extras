/**
 * API-ADM-CIC-003 — testes de aceitação com Prisma mockado.
 *
 * F3-5 ("duas gerações concorrentes: sem duplicata") depende do `FOR UPDATE`
 * real dentro de `gerar_escala_mensal` (FN-002) com duas conexões — não
 * reproduzível com mock em processo único; a idempotência em si (F3-2) é
 * coberta abaixo.
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
  queryRaw: ReturnType<typeof vi.fn>;
  escalaDiaCount: number;
  colaboradoresSemEscala?: Array<{ id: string; nome: string; matricula: string }>;
}): PrismaClient {
  const tx = {
    $queryRaw: opts.queryRaw,
    escalaDia: { count: vi.fn().mockResolvedValue(opts.escalaDiaCount) },
    colaborador: { findMany: vi.fn().mockResolvedValue(opts.colaboradoresSemEscala ?? []) },
  };
  return {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaClient;
}

describe('gerarEscala (F3-1/F3-2/F3-4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('primeira geração: criados conforme o retorno da função, jaExistentes = 0', async () => {
    const { gerarEscala } = await import('./gerar-escala');
    const queryRaw = vi.fn().mockResolvedValue([{ gerar_escala_mensal: 60 }]);
    const prisma = criarPrismaFake({ queryRaw, escalaDiaCount: 60 });

    const resultado = await gerarEscala(prisma, 'ciclo-1', ADMIN, CTX);

    expect(resultado.criados).toBe(60);
    expect(resultado.jaExistentes).toBe(0);
    expect(resultado.pulados).toEqual([]);
  });

  it('segunda geração (idempotente): criados = 0, jaExistentes = total já materializado', async () => {
    const { gerarEscala } = await import('./gerar-escala');
    const queryRaw = vi.fn().mockResolvedValue([{ gerar_escala_mensal: 0 }]);
    const prisma = criarPrismaFake({ queryRaw, escalaDiaCount: 60 });

    const resultado = await gerarEscala(prisma, 'ciclo-1', ADMIN, CTX);

    expect(resultado.criados).toBe(0);
    expect(resultado.jaExistentes).toBe(60);
  });

  it('colaborador sem linha de escala neste ciclo aparece em `pulados`', async () => {
    const { gerarEscala } = await import('./gerar-escala');
    const queryRaw = vi.fn().mockResolvedValue([{ gerar_escala_mensal: 60 }]);
    const prisma = criarPrismaFake({
      queryRaw,
      escalaDiaCount: 60,
      colaboradoresSemEscala: [{ id: 'colab-9', nome: 'Fulano', matricula: '0009' }],
    });

    const resultado = await gerarEscala(prisma, 'ciclo-1', ADMIN, CTX);

    expect(resultado.pulados).toEqual([{ colaboradorId: 'colab-9', nome: 'Fulano', matricula: '0009', motivo: 'SEM_TURNO' }]);
  });

  it('ciclo fechado: RAISE EXCEPTION CICLO_FECHADO vira erro de negócio 409', async () => {
    const { gerarEscala } = await import('./gerar-escala');
    const queryRaw = vi.fn().mockRejectedValue({ meta: { message: 'CICLO_FECHADO' } });
    const prisma = criarPrismaFake({ queryRaw, escalaDiaCount: 0 });

    await expect(gerarEscala(prisma, 'ciclo-1', ADMIN, CTX)).rejects.toMatchObject({
      status: 409,
      codigo: 'CICLO_FECHADO',
    });
  });

  it('ciclo inexistente vira 404', async () => {
    const { gerarEscala } = await import('./gerar-escala');
    const queryRaw = vi.fn().mockRejectedValue({ meta: { message: 'CICLO_INEXISTENTE' } });
    const prisma = criarPrismaFake({ queryRaw, escalaDiaCount: 0 });

    await expect(gerarEscala(prisma, 'ciclo-x', ADMIN, CTX)).rejects.toMatchObject({
      status: 404,
      codigo: 'RECURSO_NAO_ENCONTRADO',
    });
  });
});
