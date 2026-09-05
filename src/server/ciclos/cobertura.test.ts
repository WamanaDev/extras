/**
 * API-ADM-CIC-008 — testes de aceitação com Prisma mockado.
 *
 * F8-2 ("lançar F cruzando o mínimo"), F8-3 ("extra confirmada cobrindo") e
 * F8-4 ("dia com FT não conta como escalado") são comportamento da própria
 * função SQL `cobertura_ciclo` (FN-009,
 * `prisma/migrations/20260101000007_funcoes/migration.sql`) — a contagem de
 * escalados/extras e o que conta como presença acontecem inteiramente
 * dentro do `WITH` da função, não em `obterCobertura`. Neste nível (Prisma
 * mockado, sem Postgres real) o que é testável é o que a rota faz com o que
 * a função devolve: mapeamento de campo, filtro `apenasDeficit` e o resumo
 * agregado — cobertos abaixo. F8-2/3/4 pertencem a um teste de integração
 * contra `cobertura_ciclo` (fora do escopo de mock de Prisma).
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const LINHA_SEM_DEFICIT = {
  data: new Date('2026-09-05T00:00:00Z'),
  rt_codigo: 'UTI',
  turno: 'DIURNO',
  escalados: 4,
  extras: 0,
  total: 4,
  minimo: 4,
  deficit: 0,
};

const LINHA_COM_DEFICIT = {
  data: new Date('2026-09-06T00:00:00Z'),
  rt_codigo: 'UTI',
  turno: 'NOTURNO',
  escalados: 1,
  extras: 0,
  total: 1,
  minimo: 3,
  deficit: 2,
};

function criarPrismaFake(cicloExiste: boolean, linhas: unknown[]): PrismaClient {
  const tx = {
    ciclo: { findUnique: vi.fn().mockResolvedValue(cicloExiste ? { id: 'ciclo-1' } : null) },
    $queryRaw: vi.fn().mockResolvedValue(linhas),
  };
  return {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaClient;
}

describe('obterCobertura (F8-1/F8-5)', () => {
  it('dia completo (escalados + extras >= mínimo): deficit = 0, mapeado no formato de contrato', async () => {
    const { obterCobertura } = await import('./cobertura');
    const prisma = criarPrismaFake(true, [LINHA_SEM_DEFICIT]);

    const resultado = await obterCobertura(prisma, 'ciclo-1', { apenasDeficit: false });

    expect(resultado.dias).toEqual([
      { data: '2026-09-05', rt: 'UTI', turno: 'DIURNO', escalados: 4, extras: 0, total: 4, minimo: 4, deficit: 0 },
    ]);
    expect(resultado.resumo).toEqual({ diasComDeficit: 0, deficitTotal: 0 });
  });

  it('apenasDeficit filtra só os dias com déficit, mas o resumo continua contando todos', async () => {
    const { obterCobertura } = await import('./cobertura');
    const prisma = criarPrismaFake(true, [LINHA_SEM_DEFICIT, LINHA_COM_DEFICIT]);

    const resultado = await obterCobertura(prisma, 'ciclo-1', { apenasDeficit: true });

    expect(resultado.dias).toHaveLength(1);
    expect(resultado.dias[0]?.rt).toBe('UTI');
    expect(resultado.dias[0]?.deficit).toBe(2);
    expect(resultado.resumo).toEqual({ diasComDeficit: 1, deficitTotal: 2 });
  });

  it('sem apenasDeficit, devolve todos os dias e soma o déficit total', async () => {
    const { obterCobertura } = await import('./cobertura');
    const prisma = criarPrismaFake(true, [LINHA_SEM_DEFICIT, LINHA_COM_DEFICIT]);

    const resultado = await obterCobertura(prisma, 'ciclo-1', { apenasDeficit: false });

    expect(resultado.dias).toHaveLength(2);
    expect(resultado.resumo).toEqual({ diasComDeficit: 1, deficitTotal: 2 });
  });

  it('ciclo inexistente vira 404', async () => {
    const { obterCobertura } = await import('./cobertura');
    const prisma = criarPrismaFake(false, []);

    await expect(obterCobertura(prisma, 'ciclo-x', { apenasDeficit: false })).rejects.toMatchObject({
      status: 404,
      codigo: 'RECURSO_NAO_ENCONTRADO',
    });
  });

  it('nenhum dia com déficit: resumo zerado', async () => {
    const { obterCobertura } = await import('./cobertura');
    const prisma = criarPrismaFake(true, [LINHA_SEM_DEFICIT]);

    const resultado = await obterCobertura(prisma, 'ciclo-1', { apenasDeficit: true });

    expect(resultado.dias).toEqual([]);
    expect(resultado.resumo).toEqual({ diasComDeficit: 0, deficitTotal: 0 });
  });
});

describe('CoberturaQuerySchema', () => {
  it('transforma apenasDeficit=true (string de query) em boolean', async () => {
    const { CoberturaQuerySchema } = await import('./cobertura');
    expect(CoberturaQuerySchema.parse({ apenasDeficit: 'true' })).toEqual({ apenasDeficit: true });
    expect(CoberturaQuerySchema.parse({ apenasDeficit: 'false' })).toEqual({ apenasDeficit: false });
    expect(CoberturaQuerySchema.parse({})).toEqual({ apenasDeficit: false });
  });
});
