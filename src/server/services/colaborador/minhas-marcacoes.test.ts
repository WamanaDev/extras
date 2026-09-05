/**
 * Testes de aceitação de `specs/04-api/colaborador/API-COL-006-minhas-marcacoes.md`.
 */
import { describe, expect, it, vi } from 'vitest';
import { buscarMinhasMarcacoes, type ClienteMinhasMarcacoes } from './minhas-marcacoes';

const AGORA = new Date('2026-09-15T12:00:00Z');

const linhaConfirmada = {
  id: 'marc-1',
  status: 'CONFIRMADA' as const,
  cruzada: false,
  criadoEm: new Date('2026-09-10T10:00:00Z'),
  canceladoEm: null,
  plantao: {
    data: new Date('2026-09-20'),
    tipo: 'DIURNO' as const,
    horaInicio: new Date('1970-01-01T07:00:00Z'),
    horaFim: new Date('1970-01-01T19:00:00Z'),
    cargaHoras: 12,
    rt: { nome: 'RT-A' },
  },
};

const linhaCancelada = {
  ...linhaConfirmada,
  id: 'marc-2',
  status: 'CANCELADA' as const,
  canceladoEm: new Date('2026-09-11T10:00:00Z'),
};

function criarPrismaFake(config: {
  ciclo?: { status: string; aberturaMarcacao: Date | null; fechamentoMarcacao: Date | null } | null;
  marcacoes?: unknown[];
}): ClienteMinhasMarcacoes {
  return {
    ciclo: {
      findUnique: vi.fn(
        async () =>
          config.ciclo === undefined
            ? { status: 'PUBLICADO', aberturaMarcacao: null, fechamentoMarcacao: new Date('2026-09-25T23:59:59Z') }
            : config.ciclo,
      ),
    } as unknown as ClienteMinhasMarcacoes['ciclo'],
    marcacao: {
      findMany: vi.fn(async () => config.marcacoes ?? [linhaConfirmada]),
    } as unknown as ClienteMinhasMarcacoes['marcacao'],
  };
}

describe('API-COL-006 buscarMinhasMarcacoes', () => {
  it('1. confirmadas e canceladas ambas listadas', async () => {
    const prisma = criarPrismaFake({ marcacoes: [linhaConfirmada, linhaCancelada] });
    const resultado = await buscarMinhasMarcacoes(prisma, 'colab-1', 'ciclo-1', AGORA);
    expect(resultado.marcacoes).toHaveLength(2);
    expect(resultado.marcacoes.map((m) => m.status).sort()).toEqual(['CANCELADA', 'CONFIRMADA']);
  });

  it('2. fora da janela (após fechamento) → podeCancelar = false', async () => {
    const prisma = criarPrismaFake({
      ciclo: { status: 'PUBLICADO', aberturaMarcacao: null, fechamentoMarcacao: new Date('2026-09-01T00:00:00Z') },
      marcacoes: [linhaConfirmada],
    });
    const resultado = await buscarMinhasMarcacoes(prisma, 'colab-1', 'ciclo-1', AGORA);
    expect(resultado.marcacoes[0]!.podeCancelar).toBe(false);
  });

  it('dentro da janela e CONFIRMADA → podeCancelar = true', async () => {
    const prisma = criarPrismaFake({ marcacoes: [linhaConfirmada] });
    const resultado = await buscarMinhasMarcacoes(prisma, 'colab-1', 'ciclo-1', AGORA);
    expect(resultado.marcacoes[0]!.podeCancelar).toBe(true);
  });

  it('CANCELADA nunca pode ser cancelada de novo, mesmo dentro da janela', async () => {
    const prisma = criarPrismaFake({ marcacoes: [linhaCancelada] });
    const resultado = await buscarMinhasMarcacoes(prisma, 'colab-1', 'ciclo-1', AGORA);
    expect(resultado.marcacoes[0]!.podeCancelar).toBe(false);
  });

  it('ciclo FECHADO → podeCancelar = false mesmo se a data de fechamento não passou', async () => {
    const prisma = criarPrismaFake({
      ciclo: { status: 'FECHADO', aberturaMarcacao: null, fechamentoMarcacao: new Date('2026-12-31T23:59:59Z') },
      marcacoes: [linhaConfirmada],
    });
    const resultado = await buscarMinhasMarcacoes(prisma, 'colab-1', 'ciclo-1', AGORA);
    expect(resultado.marcacoes[0]!.podeCancelar).toBe(false);
  });

  it('3. marcação de terceiro não aparece — filtrado no where por construção (colaboradorId do ator), não checado aqui', async () => {
    const prisma = criarPrismaFake({ marcacoes: [linhaConfirmada] });
    await buscarMinhasMarcacoes(prisma, 'colab-1', 'ciclo-1', AGORA);
    const chamada = vi.mocked(prisma.marcacao.findMany).mock.calls[0]![0] as { where: { colaboradorId: string } };
    expect(chamada.where.colaboradorId).toBe('colab-1');
  });

  it('4. canceladas não contam em totais.horas', async () => {
    const prisma = criarPrismaFake({ marcacoes: [linhaConfirmada, linhaCancelada] });
    const resultado = await buscarMinhasMarcacoes(prisma, 'colab-1', 'ciclo-1', AGORA);
    expect(resultado.totais).toEqual({ confirmadas: 1, canceladas: 1, horas: 12 });
  });

  it('totais zerados quando não há nenhuma marcação (sem erro)', async () => {
    const prisma = criarPrismaFake({ marcacoes: [] });
    const resultado = await buscarMinhasMarcacoes(prisma, 'colab-1', 'ciclo-1', AGORA);
    expect(resultado.marcacoes).toEqual([]);
    expect(resultado.totais).toEqual({ confirmadas: 0, canceladas: 0, horas: 0 });
  });
});
