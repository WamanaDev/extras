/**
 * API-ADM-REL-001 — Testes de aceitação (#1-#4) com Prisma mockado.
 *
 * Teste #5 ("Executa em `app_readonly`") não é exercitável aqui — `ciclo.ts`
 * recebe o `PrismaClient` já injetado, sem decidir role. A escolha do role
 * `app_readonly` acontece em `./prisma-cliente.ts` (`obterPrismaRelatoriosReadonly`),
 * coberto em `./prisma-cliente.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { montarRelatorioCiclo } from './ciclo';

const CICLO_BASE = { id: 'ciclo-1', limitePadrao: 6 };

interface DadosFake {
  ciclo?: unknown;
  escalas?: unknown[];
  marcacoes?: unknown[];
  participacoes?: unknown[];
  rts?: unknown[];
  plantoes?: unknown[];
  cobertura?: unknown[];
  colaboradores?: unknown[];
}

function criarTxFake(dados: DadosFake) {
  return {
    ciclo: { findUnique: vi.fn().mockResolvedValue(dados.ciclo ?? null) },
    escalaDia: { findMany: vi.fn().mockResolvedValue(dados.escalas ?? []) },
    marcacao: { findMany: vi.fn().mockResolvedValue(dados.marcacoes ?? []) },
    participacaoCiclo: { findMany: vi.fn().mockResolvedValue(dados.participacoes ?? []) },
    rt: { findMany: vi.fn().mockResolvedValue(dados.rts ?? []) },
    plantao: { findMany: vi.fn().mockResolvedValue(dados.plantoes ?? []) },
    $queryRaw: vi.fn().mockResolvedValue(dados.cobertura ?? []),
    colaborador: { findMany: vi.fn().mockResolvedValue(dados.colaboradores ?? []) },
  };
}

function criarPrismaFake(tx: ReturnType<typeof criarTxFake>): PrismaClient {
  return {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaClient;
}

function turno(horaInicioUtc: string, horaFimUtc: string) {
  return { horaInicio: new Date(`1970-01-01T${horaInicioUtc}Z`), horaFim: new Date(`1970-01-01T${horaFimUtc}Z`) };
}

describe('montarRelatorioCiclo (API-ADM-REL-001)', () => {
  it('#1 ciclo completo — números batem com a contagem direta', async () => {
    const tx = criarTxFake({
      ciclo: CICLO_BASE,
      escalas: [
        { colaboradorId: 'colab-1', codigoEscala: { presenca: true }, ...turno('07:00:00', '19:00:00') },
        { colaboradorId: 'colab-1', codigoEscala: { presenca: true }, ...turno('07:00:00', '19:00:00') },
        { colaboradorId: 'colab-1', codigoEscala: { presenca: false } }, // folga
      ],
      marcacoes: [
        { colaboradorId: 'colab-1', cruzada: false, plantao: { cargaHoras: 8 } },
        { colaboradorId: 'colab-1', cruzada: true, plantao: { cargaHoras: 6 } },
      ],
      participacoes: [],
      rts: [{ nome: 'RT1' }],
      plantoes: [{ rt: { nome: 'RT1' }, vagasTotais: 10, vagasOcupadas: 7 }],
      cobertura: [{ rt_codigo: 'RT1', deficit: 3 }],
      colaboradores: [{ id: 'colab-1', nome: 'Fulano', matricula: '0001', rt: { nome: 'RT1' } }],
    });
    const prisma = criarPrismaFake(tx);

    const relatorio = await montarRelatorioCiclo(prisma, 'ciclo-1');

    expect(relatorio.porColaborador).toHaveLength(1);
    const linha = relatorio.porColaborador[0]!;
    expect(linha.plantoesBase).toBe(2);
    expect(linha.folgas).toBe(1);
    expect(linha.horasBase).toBe(24);
    expect(linha.extras).toBe(2);
    expect(linha.extrasCruzadas).toBe(1);
    expect(linha.horasExtras).toBe(14);
    expect(linha.limite).toBe(6);
    expect(linha.aproveitamento).toBeCloseTo(2 / 6, 10);

    expect(relatorio.porRt).toEqual([
      { rt: 'RT1', vagasOfertadas: 10, vagasPreenchidas: 7, taxaOcupacao: 0.7, deficits: 3 },
    ]);

    expect(relatorio.resumo).toEqual({
      colaboradores: 1,
      extrasTotais: 2,
      horasTotais: 38,
      vagasNaoPreenchidas: 3,
    });
  });

  it('#2 canceladas não contam — a busca de marcações filtra status CONFIRMADA', async () => {
    const tx = criarTxFake({
      ciclo: CICLO_BASE,
      escalas: [{ colaboradorId: 'colab-1', codigoEscala: { presenca: true }, ...turno('07:00:00', '19:00:00') }],
      colaboradores: [{ id: 'colab-1', nome: 'Fulano', matricula: '0001', rt: { nome: 'RT1' } }],
    });
    const prisma = criarPrismaFake(tx);

    await montarRelatorioCiclo(prisma, 'ciclo-1');

    expect(tx.marcacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'CONFIRMADA' }) }),
    );
  });

  it('#3 cruzadas contadas separadamente (extras e extrasCruzadas não se excluem)', async () => {
    const tx = criarTxFake({
      ciclo: CICLO_BASE,
      escalas: [],
      marcacoes: [
        { colaboradorId: 'colab-1', cruzada: true, plantao: { cargaHoras: 6 } },
        { colaboradorId: 'colab-1', cruzada: true, plantao: { cargaHoras: 6 } },
        { colaboradorId: 'colab-1', cruzada: false, plantao: { cargaHoras: 8 } },
      ],
      colaboradores: [{ id: 'colab-1', nome: 'Fulano', matricula: '0001', rt: { nome: 'RT1' } }],
    });
    const prisma = criarPrismaFake(tx);

    const relatorio = await montarRelatorioCiclo(prisma, 'ciclo-1');

    expect(relatorio.porColaborador[0]).toMatchObject({ extras: 3, extrasCruzadas: 2 });
  });

  it('#4 ciclo com 80 colaboradores — agregação roda em menos de 3s', async () => {
    const escalas = [];
    const marcacoes = [];
    const colaboradores = [];
    for (let i = 0; i < 80; i++) {
      const id = `colab-${i}`;
      escalas.push({ colaboradorId: id, codigoEscala: { presenca: true }, ...turno('07:00:00', '19:00:00') });
      marcacoes.push({ colaboradorId: id, cruzada: i % 5 === 0, plantao: { cargaHoras: 8 } });
      colaboradores.push({ id, nome: `Colaborador ${i}`, matricula: String(i).padStart(4, '0'), rt: { nome: 'RT1' } });
    }
    const tx = criarTxFake({
      ciclo: CICLO_BASE,
      escalas,
      marcacoes,
      rts: [{ nome: 'RT1' }],
      plantoes: [{ rt: { nome: 'RT1' }, vagasTotais: 80, vagasOcupadas: 80 }],
      colaboradores,
    });
    const prisma = criarPrismaFake(tx);

    const inicio = Date.now();
    const relatorio = await montarRelatorioCiclo(prisma, 'ciclo-1');
    const duracaoMs = Date.now() - inicio;

    expect(relatorio.porColaborador).toHaveLength(80);
    expect(duracaoMs).toBeLessThan(3000);
  });

  it('ciclo inexistente vira 404 (RECURSO_NAO_ENCONTRADO)', async () => {
    const tx = criarTxFake({ ciclo: null });
    const prisma = criarPrismaFake(tx);

    await expect(montarRelatorioCiclo(prisma, 'ciclo-x')).rejects.toMatchObject({ status: 404 });
  });
});
