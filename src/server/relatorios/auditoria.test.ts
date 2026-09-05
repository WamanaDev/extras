/**
 * API-ADM-REL-003 — Testes de aceitação #1-#4 com Prisma mockado.
 * (#5 — "Colaborador chamando → 403" — é responsabilidade do pipeline
 * `defineHandler`/`ator: 'ADMIN'`, já coberto por `src/server/http/handler.test.ts`;
 * `consultarAuditoria` não decide ator, recebe o admin já resolvido.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { consultarAuditoria } from './auditoria';
import { calcularHash, GENESIS } from '@/server/audit/hash-chain';

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn().mockResolvedValue({ id: 'audit-novo', hash: 'hash-novo' }),
}));

const CONTEXTO = { atorId: 'admin-1', ip: '10.0.0.1', userAgent: 'vitest', requestId: 'req-1' };

function linhaValida(overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    id: 'evt-1',
    atorTipo: 'COLABORADOR',
    atorId: 'colab-1',
    acao: 'EXTRA_MARCADA',
    entidade: 'marcacao',
    entidadeId: 'marcacao-1',
    payload: { plantaoId: 'p1' },
    ip: '10.0.0.2',
    userAgent: 'chrome',
    requestId: 'req-original',
    criadoEm: new Date('2026-09-01T10:00:00-03:00'),
    hashAnterior: GENESIS,
    ...overrides,
  };
  const hash = calcularHash({
    hashAnterior: base.hashAnterior,
    id: base.id,
    atorId: base.atorId,
    acao: base.acao,
    entidadeId: base.entidadeId,
    payloadTexto: JSON.stringify(base.payload),
    criadoEm: base.criadoEm.toISOString(),
  });
  return { ...base, hash };
}

function criarPrismaFake(linhas: unknown[], total: number, colaboradores: unknown[] = []) {
  const tx = {
    auditLog: {
      findMany: vi.fn().mockResolvedValue(linhas),
      count: vi.fn().mockResolvedValue(total),
    },
    colaborador: {
      findMany: vi.fn().mockResolvedValue(colaboradores),
    },
  };
  const prisma = {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaClient;
  return { prisma, tx };
}

describe('consultarAuditoria (API-ADM-REL-003)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('#1 filtro por entidade — repassado ao where do Prisma', async () => {
    const { prisma, tx } = criarPrismaFake([], 0);

    await consultarAuditoria(prisma, { entidade: 'marcacao', pagina: 1, tamanho: 50 }, CONTEXTO);

    expect(tx.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entidade: 'marcacao' }) }),
    );
  });

  it('#2 a própria consulta gera AUDITORIA_CONSULTADA', async () => {
    const { prisma } = criarPrismaFake([], 0);

    await consultarAuditoria(prisma, { pagina: 1, tamanho: 50 }, CONTEXTO);

    const { registrarAuditoria } = await import('@/server/audit/registrar');
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ acao: 'AUDITORIA_CONSULTADA', atorTipo: 'ADMIN', atorId: 'admin-1' }),
    );
  });

  it('#3 linha adulterada vem com integridade: QUEBRADA; linha íntegra vem OK', async () => {
    const integra = linhaValida({ id: 'evt-integro' });
    // Hash gravado continua o original, mas um campo foi alterado depois (adulteração
    // direta na tabela) — `id: 'evt-adulterado'` some do lado direito porque
    // `linhaValida` recalcula o hash em cima do que recebe; aqui a mutação acontece
    // *depois* do hash já calculado, exatamente o cenário que a checagem detecta.
    const adulterada = { ...linhaValida({ id: 'evt-adulterado' }), payload: { plantaoId: 'valor-trocado-apos-o-hash' } };
    const { prisma } = criarPrismaFake([integra, adulterada], 2, [{ id: 'colab-1', nome: 'Fulano' }]);

    const resultado = await consultarAuditoria(prisma, { pagina: 1, tamanho: 50 }, CONTEXTO);

    expect(resultado.eventos.find((e) => e.id === 'evt-integro')?.integridade).toBe('OK');
    expect(resultado.eventos.find((e) => e.id === 'evt-adulterado')?.integridade).toBe('QUEBRADA');
  });

  it('#4 PIN ausente do payload — o que foi persistido (já redigido por registrarAuditoria) volta como está, sem PIN em claro', async () => {
    const linha = linhaValida({ payload: { pin: '[REDIGIDO]', nome: 'Maria' } });
    const { prisma } = criarPrismaFake([linha], 1);

    const resultado = await consultarAuditoria(prisma, { pagina: 1, tamanho: 50 }, CONTEXTO);

    const payloadTexto = JSON.stringify(resultado.eventos[0]?.payload);
    expect(payloadTexto).not.toContain('1234');
  });

  it('paginação: skip/take calculados a partir de pagina/tamanho', async () => {
    const { prisma, tx } = criarPrismaFake([], 0);

    await consultarAuditoria(prisma, { pagina: 3, tamanho: 20 }, CONTEXTO);

    expect(tx.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 40, take: 20 }));
  });
});
