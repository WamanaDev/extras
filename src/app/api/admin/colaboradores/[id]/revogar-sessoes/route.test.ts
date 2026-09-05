/**
 * Testes de aceitação de `specs/04-api/admin-colaboradores/API-ADM-COL-010-revogar-sessoes.md`.
 *
 * Mesma técnica de injeção de `resetar-pin/route.test.ts` (ver doc-comment lá).
 */
import { beforeAll, describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import type { AtorAdmin, DependenciasHandler, criarDefineHandler as CriarDefineHandlerFn } from '@/server/http/handler';

const AGORA_FIXA = new Date('2026-09-04T12:00:00.000Z');
const ADMIN: AtorAdmin = { tipo: 'ADMIN', adminId: 'admin-1', email: 'admin@exemplo.com' };
const COLABORADOR_ID = '11111111-1111-1111-1111-111111111111';
const COLABORADOR_INEXISTENTE_ID = '22222222-2222-2222-2222-222222222222';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:6543/extras?pgbouncer=true';
  process.env.DIRECT_URL ??= 'postgresql://postgres:postgres@localhost:5432/extras';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'teste';
  process.env.SESSION_SECRET ??= 'a'.repeat(32);
  process.env.CPF_PEPPER ??= 'pepper-cpf-teste';
  process.env.PIN_PEPPER ??= 'pepper-pin-teste';
  process.env.UPSTASH_REDIS_REST_URL ??= 'https://exemplo.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ??= 'teste';
  process.env.TZ ??= 'America/Sao_Paulo';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://exemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'teste';
});

vi.mock('@/server/http/handler', async () => {
  const actual = await vi.importActual<typeof import('@/server/http/handler')>('@/server/http/handler');
  const deps: DependenciasHandler = {
    relogio: () => AGORA_FIXA,
    resolverSessao: vi.fn(async () => ADMIN),
    verificarLimite: vi.fn(async () => ({ permitido: true, limite: 100, restante: 99, retryAfter: 0 })),
    registrarLog: vi.fn(),
    gerarRequestId: () => 'req-fixo-1',
  };
  return { ...actual, defineHandler: (actual.criarDefineHandler as typeof CriarDefineHandlerFn)(deps) };
});

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn(async () => ({ id: 'audit-1', hash: 'hash-1' })),
}));

interface FakePrisma {
  colaborador: { findUnique: ReturnType<typeof vi.fn> };
  sessaoColaborador: { updateMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
}

function criarPrismaFake(config: { existe?: boolean; revogadas?: number }): FakePrisma {
  const existe = config.existe ?? true;
  const prisma: FakePrisma = {
    colaborador: {
      findUnique: vi.fn(async () => (existe ? { id: COLABORADOR_ID } : null)),
    },
    sessaoColaborador: {
      updateMany: vi.fn(async () => ({ count: config.revogadas ?? 3 })),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  return prisma;
}

function req(url: string, opcoes: { body?: unknown } = {}): NextRequest {
  const headers = new Headers({ 'x-requested-with': 'fetch', 'content-type': 'application/json' });
  const init: { method: string; headers: Headers; body?: string } = { method: 'POST', headers };
  if (opcoes.body !== undefined) init.body = JSON.stringify(opcoes.body);
  return new NextRequest(new URL(url, 'http://localhost'), init);
}

let criarHandlerRevogarSessoes: typeof import('./_impl').criarHandlerRevogarSessoes;
let registrarAuditoria: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const modulo = await import('./_impl');
  criarHandlerRevogarSessoes = modulo.criarHandlerRevogarSessoes;
  const auditoria = await import('@/server/audit/registrar');
  registrarAuditoria = vi.mocked(auditoria.registrarAuditoria);
});

beforeEach(() => {
  registrarAuditoria.mockClear();
});

describe('API-ADM-COL-010 POST /api/admin/colaboradores/:id/revogar-sessoes', () => {
  it('teste 1 — 3 sessões ativas revogadas', async () => {
    const prisma = criarPrismaFake({ revogadas: 3 });
    const POST = criarHandlerRevogarSessoes(prisma as unknown as PrismaClient);

    const response = await POST(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_ID}/revogar-sessoes`, { body: { motivo: 'Suspeita de comprometimento.' } }), {
      params: Promise.resolve({ id: COLABORADOR_ID }),
    });

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo).toEqual({ revogadas: 3 });
    expect(prisma.sessaoColaborador.updateMany).toHaveBeenCalledWith({
      where: { colaboradorId: COLABORADOR_ID, revogadaEm: null },
      data: { revogadaEm: AGORA_FIXA },
    });
  });

  it('teste 3 — sem sessões ativas → 0, sem erro (idempotente)', async () => {
    const prisma = criarPrismaFake({ revogadas: 0 });
    const POST = criarHandlerRevogarSessoes(prisma as unknown as PrismaClient);

    const response = await POST(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_ID}/revogar-sessoes`, { body: { motivo: 'Nova checagem.' } }), {
      params: Promise.resolve({ id: COLABORADOR_ID }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revogadas: 0 });
  });

  it('teste 4 — sem motivo → 422', async () => {
    const prisma = criarPrismaFake({});
    const POST = criarHandlerRevogarSessoes(prisma as unknown as PrismaClient);

    const response = await POST(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_ID}/revogar-sessoes`, { body: {} }), {
      params: Promise.resolve({ id: COLABORADOR_ID }),
    });

    expect(response.status).toBe(422);
    expect(prisma.sessaoColaborador.updateMany).not.toHaveBeenCalled();
  });

  it('audita SESSAO_REVOGADA com contagem e motivo', async () => {
    const prisma = criarPrismaFake({ revogadas: 2 });
    const POST = criarHandlerRevogarSessoes(prisma as unknown as PrismaClient);

    await POST(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_ID}/revogar-sessoes`, { body: { motivo: 'Desligamento.' } }), {
      params: Promise.resolve({ id: COLABORADOR_ID }),
    });

    expect(registrarAuditoria).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        acao: 'SESSAO_REVOGADA',
        entidade: 'colaborador',
        entidadeId: COLABORADOR_ID,
        payload: { motivo: 'Desligamento.', quantidade: 2 },
      }),
    );
  });

  it('colaborador inexistente → 404', async () => {
    const prisma = criarPrismaFake({ existe: false });
    const POST = criarHandlerRevogarSessoes(prisma as unknown as PrismaClient);

    const response = await POST(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_INEXISTENTE_ID}/revogar-sessoes`, { body: { motivo: 'Qualquer.' } }), {
      params: Promise.resolve({ id: COLABORADOR_INEXISTENTE_ID }),
    });

    expect(response.status).toBe(404);
  });
});
