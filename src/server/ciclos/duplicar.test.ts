/**
 * API-ADM-CIC-007 — testes de aceitação com Prisma mockado.
 *
 * F7-5 ("falha no meio: rollback total") depende do comportamento real de
 * `prisma.$transaction` abortando todas as escritas quando o callback
 * rejeita — `emTransacao` (`src/server/db/tx.ts`) é o único ponto que chama
 * `$transaction`, e seu contrato já é o que garante isso; aqui testamos que
 * `duplicarCiclo` propaga o erro sem engolir (o mock de `$transaction`
 * simplesmente invoca o callback, então "propaga sem capturar" é o
 * observável correto neste nível, igual ao padrão de `criar.test.ts`).
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

const ORIGEM = {
  id: 'ciclo-origem',
  ano: 2026,
  mes: 8, // agosto tem 31 dias
  status: 'FECHADO',
  limitePadrao: 6,
  permiteCruzada: true,
  permiteExtraEmFolga: false,
  maxBlocosSeguidos: 2,
};

interface OpcoesFake {
  origem?: Record<string, unknown> | null;
  cicloCreateImpl?: () => unknown;
  plantoesOrigem?: Array<Record<string, unknown>>;
  participacoesOrigem?: Array<Record<string, unknown>>;
}

function criarPrismaFake(opts: OpcoesFake) {
  const plantaoCreate = vi.fn().mockResolvedValue({});
  const participacaoCreate = vi.fn().mockResolvedValue({});
  const cicloCreate = opts.cicloCreateImpl
    ? vi.fn().mockImplementation(opts.cicloCreateImpl)
    : vi.fn().mockResolvedValue({ id: 'ciclo-destino', ano: 2026, mes: 9, status: 'RASCUNHO' });

  const tx = {
    ciclo: {
      findUnique: vi.fn().mockResolvedValue(opts.origem === undefined ? ORIGEM : opts.origem),
      create: cicloCreate,
    },
    plantao: {
      findMany: vi.fn().mockResolvedValue(opts.plantoesOrigem ?? []),
      create: plantaoCreate,
    },
    participacaoCiclo: {
      findMany: vi.fn().mockResolvedValue(opts.participacoesOrigem ?? []),
      create: participacaoCreate,
    },
  };
  const prisma = {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaClient;
  return { prisma, tx, plantaoCreate, participacaoCreate };
}

describe('duplicarCiclo (F7-1..F7-4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dia 31 descartado ao duplicar para um mês de 30 dias, e informado na resposta', async () => {
    const { duplicarCiclo } = await import('./duplicar');
    const plantoesOrigem = [
      { id: 'p1', cicloId: 'ciclo-origem', rtId: 'rt-1', data: new Date(Date.UTC(2026, 7, 30)), tipo: 'DIURNO', horaInicio: '07:00', horaFim: '19:00', cargaHoras: 12, vagasTotais: 2, vagasOcupadas: 2, permiteCruzada: null, observacao: null },
      { id: 'p2', cicloId: 'ciclo-origem', rtId: 'rt-1', data: new Date(Date.UTC(2026, 7, 31)), tipo: 'DIURNO', horaInicio: '07:00', horaFim: '19:00', cargaHoras: 12, vagasTotais: 2, vagasOcupadas: 1, permiteCruzada: null, observacao: null },
    ];
    const { prisma, plantaoCreate } = criarPrismaFake({ plantoesOrigem });

    const resultado = await duplicarCiclo(prisma, 'ciclo-origem', { ano: 2026, mes: 9 }, ADMIN, CTX);

    expect(resultado.plantoesCriados).toBe(1);
    expect(resultado.plantoesDescartados).toBe(1);
    expect(plantaoCreate).toHaveBeenCalledTimes(1);
  });

  it('vagasOcupadas nos plantões novos é sempre zero, mesmo copiando de um plantão com vagas ocupadas', async () => {
    const { duplicarCiclo } = await import('./duplicar');
    const plantoesOrigem = [
      { id: 'p1', cicloId: 'ciclo-origem', rtId: 'rt-1', data: new Date(Date.UTC(2026, 7, 5)), tipo: 'NOTURNO', horaInicio: '19:00', horaFim: '07:00', cargaHoras: 12, vagasTotais: 3, vagasOcupadas: 3, permiteCruzada: null, observacao: null },
    ];
    const { prisma, plantaoCreate } = criarPrismaFake({ plantoesOrigem });

    await duplicarCiclo(prisma, 'ciclo-origem', { ano: 2026, mes: 9 }, ADMIN, CTX);

    expect(plantaoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ vagasOcupadas: 0 }) }),
    );
  });

  it('bloqueado (e motivo) de participacao_ciclo nunca é copiado', async () => {
    const { duplicarCiclo } = await import('./duplicar');
    const participacoesOrigem = [
      { id: 'part-1', cicloId: 'ciclo-origem', colaboradorId: 'colab-1', limiteOverride: 5, permiteCruzada: true, bloqueado: true, motivo: 'Advertência' },
    ];
    const { prisma, participacaoCreate } = criarPrismaFake({ participacoesOrigem });

    const resultado = await duplicarCiclo(
      prisma,
      'ciclo-origem',
      { ano: 2026, mes: 9, copiarParticipacoes: true },
      ADMIN,
      CTX,
    );

    expect(resultado.participacoesCriadas).toBe(1);
    expect(participacaoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bloqueado: false, motivo: null }) }),
    );
  });

  it('destino já existente (ano/mês duplicado) vira CICLO_JA_EXISTE 409', async () => {
    const { duplicarCiclo } = await import('./duplicar');
    const erroUnicidade = { code: '23505', meta: { constraint: 'ciclo_unico' } };
    const { prisma } = criarPrismaFake({ cicloCreateImpl: () => { throw erroUnicidade; } });

    await expect(duplicarCiclo(prisma, 'ciclo-origem', { ano: 2026, mes: 9 }, ADMIN, CTX)).rejects.toMatchObject({
      status: 409,
      codigo: 'CICLO_JA_EXISTE',
    });
  });

  it('ciclo origem inexistente vira 404', async () => {
    const { duplicarCiclo } = await import('./duplicar');
    const { prisma } = criarPrismaFake({ origem: null });

    await expect(duplicarCiclo(prisma, 'ciclo-x', { ano: 2026, mes: 9 }, ADMIN, CTX)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('erro no meio da cópia (ex.: falha ao criar um plantão) propaga sem ser engolido', async () => {
    const { duplicarCiclo } = await import('./duplicar');
    const plantoesOrigem = [
      { id: 'p1', cicloId: 'ciclo-origem', rtId: 'rt-1', data: new Date(Date.UTC(2026, 7, 5)), tipo: 'DIURNO', horaInicio: '07:00', horaFim: '19:00', cargaHoras: 12, vagasTotais: 2, vagasOcupadas: 0, permiteCruzada: null, observacao: null },
    ];
    const { prisma, tx } = criarPrismaFake({ plantoesOrigem });
    const falha = new Error('falha simulada de escrita');
    (tx.plantao.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(falha);

    await expect(duplicarCiclo(prisma, 'ciclo-origem', { ano: 2026, mes: 9 }, ADMIN, CTX)).rejects.toBe(falha);
  });

  it('copiarPlantoes: false não copia nenhum plantão', async () => {
    const { duplicarCiclo } = await import('./duplicar');
    const plantoesOrigem = [
      { id: 'p1', cicloId: 'ciclo-origem', rtId: 'rt-1', data: new Date(Date.UTC(2026, 7, 5)), tipo: 'DIURNO', horaInicio: '07:00', horaFim: '19:00', cargaHoras: 12, vagasTotais: 2, vagasOcupadas: 0, permiteCruzada: null, observacao: null },
    ];
    const { prisma, plantaoCreate } = criarPrismaFake({ plantoesOrigem });

    const resultado = await duplicarCiclo(prisma, 'ciclo-origem', { ano: 2026, mes: 9, copiarPlantoes: false }, ADMIN, CTX);

    expect(resultado.plantoesCriados).toBe(0);
    expect(plantaoCreate).not.toHaveBeenCalled();
  });
});
