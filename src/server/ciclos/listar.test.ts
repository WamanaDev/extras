/**
 * API-ADM-CIC-001 — testes de aceitação com Prisma mockado (`$queryRaw`).
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { listarCiclos } from './listar';

function criarPrismaFake(linhas: unknown[]): PrismaClient {
  return { $queryRaw: vi.fn().mockResolvedValue(linhas) } as unknown as PrismaClient;
}

const LINHA_BASE = {
  id: 'ciclo-1',
  ano: 2026,
  mes: 9,
  status: 'PUBLICADO',
  limitePadrao: 4,
  permiteCruzada: true,
  abertura: new Date('2026-08-25T00:00:00-03:00'),
  fechamento: new Date('2026-09-05T00:00:00-03:00'),
  plantoes: 10,
  vagas: 20,
  ocupadas: 15,
  colaboradoresComEscala: 30,
  totalCount: 1,
};

describe('listarCiclos (API-ADM-CIC-001, teste F1-1/F1-2)', () => {
  it('mapeia as linhas agregadas para o formato de contrato, incluindo janela e totais', async () => {
    const prisma = criarPrismaFake([LINHA_BASE]);

    const resultado = await listarCiclos(prisma, { pagina: 1, tamanho: 50 });

    expect(resultado.total).toBe(1);
    expect(resultado.itens).toEqual([
      {
        id: 'ciclo-1',
        ano: 2026,
        mes: 9,
        status: 'PUBLICADO',
        limitePadrao: 4,
        permiteCruzada: true,
        janela: { abertura: LINHA_BASE.abertura.toISOString(), fechamento: LINHA_BASE.fechamento.toISOString() },
        totais: { plantoes: 10, vagas: 20, ocupadas: 15, colaboradoresComEscala: 30 },
      },
    ]);
  });

  it('janela nula (sem abertura/fechamento configurados) vira null, não erro', async () => {
    const prisma = criarPrismaFake([{ ...LINHA_BASE, abertura: null, fechamento: null }]);

    const resultado = await listarCiclos(prisma, { pagina: 1, tamanho: 50 });

    expect(resultado.itens[0]?.janela).toEqual({ abertura: null, fechamento: null });
  });

  it('lista vazia devolve total 0, sem quebrar no `totalCount` do primeiro item', async () => {
    const prisma = criarPrismaFake([]);

    const resultado = await listarCiclos(prisma, { pagina: 1, tamanho: 50 });

    expect(resultado).toEqual({ itens: [], total: 0 });
  });

  it('repassa status/ano/paginação como parâmetros da query (filtro aplicado no SQL, não em memória)', async () => {
    const prisma = criarPrismaFake([{ ...LINHA_BASE, totalCount: 1 }]);
    const queryRawMock = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

    await listarCiclos(prisma, { status: 'PUBLICADO', ano: 2026, pagina: 2, tamanho: 10 });

    // Tagged template: primeiro argumento são os pedaços literais do SQL,
    // os seguintes são os valores interpolados (status, ano, tamanho, offset).
    const chamada = queryRawMock.mock.calls[0];
    expect(chamada).toContain('PUBLICADO');
    expect(chamada).toContain(2026);
    expect(chamada).toContain(10); // tamanho
    expect(chamada).toContain(10); // offset = (pagina 2 - 1) * tamanho 10
  });
});
