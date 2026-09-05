import { describe, expect, it, vi } from 'vitest';
import { rodarValidacaoDiaria } from './validar-cadeia';
import { calcularHash } from './hash-chain';
import type { PrismaClient } from '@prisma/client';

describe('rodarValidacaoDiaria (job AUD-4) — com Prisma fake, sem banco real', () => {
  it('página única: recalcula a cadeia e devolve integra=true quando está tudo certo', async () => {
    const criadoEm = new Date('2026-09-03T10:00:00.000Z');
    const hash1 = calcularHash({
      hashAnterior: null, id: '1', atorId: 'a', acao: 'LOGIN_SUCESSO', entidadeId: null,
      payloadTexto: 'null', criadoEm: criadoEm.toISOString(),
    });

    const queryRaw = vi.fn()
      .mockResolvedValueOnce([
        { id: '1', hash_anterior: null, hash: hash1, ator_id: 'a', acao: 'LOGIN_SUCESSO', entidade_id: null, payload: null, criado_em: criadoEm },
      ])
      .mockResolvedValueOnce([]);

    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;
    const resultado = await rodarValidacaoDiaria(prisma);

    expect(resultado.integra).toBe(true);
    expect(resultado.totalLinhas).toBe(1);
  });

  it('detecta linha adulterada mesmo vinda do banco (payload não bate com o hash gravado)', async () => {
    const criadoEm = new Date('2026-09-03T10:00:00.000Z');
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([
        {
          id: '1', hash_anterior: null, hash: 'hash-gravado-nao-confere', ator_id: 'a',
          acao: 'LOGIN_SUCESSO', entidade_id: null, payload: { adulterado: true }, criado_em: criadoEm,
        },
      ])
      .mockResolvedValueOnce([]);

    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;
    const resultado = await rodarValidacaoDiaria(prisma);

    expect(resultado.integra).toBe(false);
    expect(resultado.quebras[0]?.motivo).toBe('HASH_RECALCULADO_DIFERENTE');
  });

  it('audit_log vazia é íntegra por vacuidade', async () => {
    const queryRaw = vi.fn().mockResolvedValueOnce([]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;
    const resultado = await rodarValidacaoDiaria(prisma);
    expect(resultado.integra).toBe(true);
    expect(resultado.totalLinhas).toBe(0);
  });
});
