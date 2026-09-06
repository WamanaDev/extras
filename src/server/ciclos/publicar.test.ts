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
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AtorAdmin, ContextoRequisicao } from '@/server/http/handler';

// `publicar.ts` agora chama `criarNotificacao` (pedido do usuário — avisa
// colaboradores ativos ao publicar), que importa `push.ts`, que valida
// `src/env.ts` no import do módulo — mesmo motivo de `handler.test.ts`.
beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:6543/extras?pgbouncer=true';
  process.env.DIRECT_URL ??= 'postgresql://postgres:postgres@localhost:5432/extras';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'teste';
  process.env.SESSION_SECRET ??= 'a'.repeat(32);
  process.env.PIN_PEPPER ??= 'pepper-pin-teste';
  process.env.UPSTASH_REDIS_REST_URL ??= 'https://exemplo.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ??= 'teste';
  process.env.TZ ??= 'America/Sao_Paulo';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://exemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'teste';
});

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn().mockResolvedValue({ id: 'audit-1', hash: 'hash-1' }),
}));

const criarNotificacaoMock = vi.fn().mockResolvedValue({ id: 'notif-1' });
vi.mock('@/server/notificacoes/criar', () => ({
  criarNotificacao: (...args: unknown[]) => criarNotificacaoMock(...args),
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
  colaboradoresAtivos?: Array<{ id: string }>;
}): PrismaClient {
  const queryRaw = vi.fn();
  queryRaw.mockResolvedValueOnce(opts.cicloRow ? [opts.cicloRow] : []); // buscarCicloParaPublicar (FOR UPDATE)
  queryRaw.mockResolvedValueOnce(opts.cobertura ?? []); // cobertura_ciclo
  const tx = {
    $queryRaw: queryRaw,
    plantao: { count: vi.fn().mockResolvedValue(opts.totalPlantoes) },
    colaborador: { count: vi.fn().mockResolvedValue(opts.semEscala ?? 0) },
    ciclo: { update: vi.fn().mockResolvedValue(opts.cicloAtualizado ?? { id: 'ciclo-1', status: 'PUBLICADO', ano: 2026, mes: 9 }) },
  };
  return {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    // Fora da transação — notificação aos colaboradores ativos, só depois do commit (ver `publicar.ts`).
    colaborador: { findMany: vi.fn().mockResolvedValue(opts.colaboradoresAtivos ?? []) },
  } as unknown as PrismaClient;
}

describe('publicarCiclo (F5-1..F5-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    criarNotificacaoMock.mockClear();
  });

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

  it('publicação bem-sucedida notifica TODOS os colaboradores ativos (pedido do usuário), com a competência certa no texto', async () => {
    const { publicarCiclo } = await import('./publicar');
    const prisma = criarPrismaFake({
      cicloRow: CICLO_ROW_BASE,
      totalPlantoes: 5,
      cobertura: [{ deficit: 0 }],
      cicloAtualizado: { id: 'ciclo-1', status: 'PUBLICADO', ano: 2026, mes: 9 },
      colaboradoresAtivos: [{ id: 'colab-1' }, { id: 'colab-2' }],
    });

    await publicarCiclo(prisma, 'ciclo-1', {}, ADMIN, CTX);

    expect(criarNotificacaoMock).toHaveBeenCalledTimes(2);
    expect(criarNotificacaoMock).toHaveBeenCalledWith(prisma, {
      colaboradorId: 'colab-1',
      tipo: 'CICLO_PUBLICADO',
      titulo: 'Escala publicada',
      mensagem: 'A escala de Setembro/2026 foi publicada.',
      link: '/minha-escala',
    });
    expect(criarNotificacaoMock).toHaveBeenCalledWith(prisma, expect.objectContaining({ colaboradorId: 'colab-2' }));
  });

  it('falha ao notificar não desfaz nem falha a publicação já commitada (best-effort)', async () => {
    const { publicarCiclo } = await import('./publicar');
    criarNotificacaoMock.mockRejectedValueOnce(new Error('falha ao gravar notificação'));
    const prisma = criarPrismaFake({
      cicloRow: CICLO_ROW_BASE,
      totalPlantoes: 5,
      cobertura: [{ deficit: 0 }],
      colaboradoresAtivos: [{ id: 'colab-1' }],
    });

    const resultado = await publicarCiclo(prisma, 'ciclo-1', {}, ADMIN, CTX);

    expect(resultado.ciclo.status).toBe('PUBLICADO');
  });

  it('nenhum colaborador ativo → não chama criarNotificacao, publicação segue normal', async () => {
    const { publicarCiclo } = await import('./publicar');
    const prisma = criarPrismaFake({ cicloRow: CICLO_ROW_BASE, totalPlantoes: 5, cobertura: [{ deficit: 0 }], colaboradoresAtivos: [] });

    const resultado = await publicarCiclo(prisma, 'ciclo-1', {}, ADMIN, CTX);

    expect(resultado.ciclo.status).toBe('PUBLICADO');
    expect(criarNotificacaoMock).not.toHaveBeenCalled();
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
