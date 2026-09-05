/**
 * API-ADM-CIC-005 — testes de aceitação com Prisma mockado.
 *
 * F5-7 ("duas publicações concorrentes: uma só") depende do `FOR UPDATE`
 * real com duas conexões simultâneas — não reproduzível com mock em
 * processo único (mesmo padrão de `criar.test.ts`/`gerar-escala.test.ts`).
 * O efeito observável dessa concorrência — a segunda chamada vendo
 * `status = 'PUBLICADO'` e recebendo `TRANSICAO_INVALIDA` — é exatamente
 * o que F5-6 cobre de forma determinística.
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

const CICLO_ROW_BASE = {
  id: 'ciclo-1',
  status: 'RASCUNHO' as const,
  escala_gerada_em: new Date('2026-08-20T10:00:00-03:00'),
  fechamento_marcacao: null,
};

function criarPrismaFake(opts: {
  cicloRow: Record<string, unknown> | undefined;
  totalPlantoes: number;
  cobertura?: Array<{ deficit: number }>;
  semEscala?: number;
  cicloAtualizado?: Record<string, unknown>;
}): PrismaClient {
  const queryRaw = vi.fn();
  queryRaw.mockResolvedValueOnce(opts.cicloRow ? [opts.cicloRow] : []); // buscarCicloParaPublicar (FOR UPDATE)
  queryRaw.mockResolvedValueOnce(opts.cobertura ?? []); // cobertura_ciclo
  const tx = {
    $queryRaw: queryRaw,
    plantao: { count: vi.fn().mockResolvedValue(opts.totalPlantoes) },
    colaborador: { count: vi.fn().mockResolvedValue(opts.semEscala ?? 0) },
    ciclo: { update: vi.fn().mockResolvedValue(opts.cicloAtualizado ?? { id: 'ciclo-1', status: 'PUBLICADO' }) },
  };
  return {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaClient;
}

describe('publicarCiclo (F5-1..F5-6)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('publicação válida (escala gerada, plantões, sem avisos) vira PUBLICADO', async () => {
    const { publicarCiclo } = await import('./publicar');
    const prisma = criarPrismaFake({ cicloRow: CICLO_ROW_BASE, totalPlantoes: 5, cobertura: [{ deficit: 0 }] });

    const resultado = await publicarCiclo(prisma, 'ciclo-1', {}, ADMIN, CTX);

    expect(resultado.ciclo.status).toBe('PUBLICADO');
    expect(resultado.avisos).toEqual([]);
    const { registrarAuditoria } = await import('@/server/audit/registrar');
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ acao: 'CICLO_PUBLICADO', entidadeId: 'ciclo-1' }),
    );
  });

  it('sem escala gerada devolve ESCALA_NAO_GERADA', async () => {
    const { publicarCiclo } = await import('./publicar');
    const prisma = criarPrismaFake({
      cicloRow: { ...CICLO_ROW_BASE, escala_gerada_em: null },
      totalPlantoes: 5,
    });

    await expect(publicarCiclo(prisma, 'ciclo-1', {}, ADMIN, CTX)).rejects.toMatchObject({
      status: 409,
      codigo: 'ESCALA_NAO_GERADA',
    });
  });

  it('sem plantões ativos devolve SEM_PLANTOES', async () => {
    const { publicarCiclo } = await import('./publicar');
    const prisma = criarPrismaFake({ cicloRow: CICLO_ROW_BASE, totalPlantoes: 0 });

    await expect(publicarCiclo(prisma, 'ciclo-1', {}, ADMIN, CTX)).rejects.toMatchObject({
      status: 409,
      codigo: 'SEM_PLANTOES',
    });
  });

  it('com déficit de cobertura, sem ignorarAvisos, devolve AVISOS_NAO_CONFIRMADOS com a lista', async () => {
    const { publicarCiclo } = await import('./publicar');
    const prisma = criarPrismaFake({
      cicloRow: CICLO_ROW_BASE,
      totalPlantoes: 5,
      cobertura: [{ deficit: 2 }, { deficit: 0 }],
    });

    const erro = await publicarCiclo(prisma, 'ciclo-1', {}, ADMIN, CTX).catch((e) => e);

    expect(erro).toMatchObject({ status: 409, codigo: 'AVISOS_NAO_CONFIRMADOS' });
    expect(erro.detalhes).toHaveProperty('DEFICIT_COBERTURA');
  });

  it('com ignorarAvisos: true, publica mesmo com déficit', async () => {
    const { publicarCiclo } = await import('./publicar');
    const prisma = criarPrismaFake({
      cicloRow: CICLO_ROW_BASE,
      totalPlantoes: 5,
      cobertura: [{ deficit: 2 }],
    });

    const resultado = await publicarCiclo(prisma, 'ciclo-1', { ignorarAvisos: true }, ADMIN, CTX);

    expect(resultado.ciclo.status).toBe('PUBLICADO');
    expect(resultado.avisos).toHaveLength(1);
  });

  it('ciclo já publicado devolve TRANSICAO_INVALIDA', async () => {
    const { publicarCiclo } = await import('./publicar');
    const prisma = criarPrismaFake({ cicloRow: { ...CICLO_ROW_BASE, status: 'PUBLICADO' }, totalPlantoes: 5 });

    await expect(publicarCiclo(prisma, 'ciclo-1', {}, ADMIN, CTX)).rejects.toMatchObject({
      status: 409,
      codigo: 'TRANSICAO_INVALIDA',
    });
  });

  it('ciclo inexistente vira 404', async () => {
    const { publicarCiclo } = await import('./publicar');
    const prisma = criarPrismaFake({ cicloRow: undefined, totalPlantoes: 0 });

    await expect(publicarCiclo(prisma, 'ciclo-x', {}, ADMIN, CTX)).rejects.toMatchObject({
      status: 404,
      codigo: 'RECURSO_NAO_ENCONTRADO',
    });
  });

  it('colaborador ativo sem escala gera aviso COLABORADOR_SEM_ESCALA', async () => {
    const { publicarCiclo } = await import('./publicar');
    const prisma = criarPrismaFake({ cicloRow: CICLO_ROW_BASE, totalPlantoes: 5, cobertura: [{ deficit: 0 }], semEscala: 3 });

    const erro = await publicarCiclo(prisma, 'ciclo-1', {}, ADMIN, CTX).catch((e) => e);

    expect(erro).toMatchObject({ status: 409, codigo: 'AVISOS_NAO_CONFIRMADOS' });
    expect(erro.detalhes).toHaveProperty('COLABORADOR_SEM_ESCALA');
  });

  it('janela de fechamento já no passado gera aviso JANELA_NO_PASSADO', async () => {
    const { publicarCiclo } = await import('./publicar');
    const prisma = criarPrismaFake({
      cicloRow: { ...CICLO_ROW_BASE, fechamento_marcacao: new Date('2026-01-01T00:00:00-03:00') },
      totalPlantoes: 5,
      cobertura: [{ deficit: 0 }],
    });

    const erro = await publicarCiclo(prisma, 'ciclo-1', {}, ADMIN, CTX).catch((e) => e);

    expect(erro).toMatchObject({ status: 409, codigo: 'AVISOS_NAO_CONFIRMADOS' });
    expect(erro.detalhes).toHaveProperty('JANELA_NO_PASSADO');
  });
});
