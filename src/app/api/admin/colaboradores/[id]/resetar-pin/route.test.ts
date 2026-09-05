/**
 * Testes de aceitação de `specs/04-api/admin-colaboradores/API-ADM-COL-007-resetar-pin.md`.
 *
 * `defineHandler` é substituído (via `vi.mock`) por `criarDefineHandler` com
 * dependências fake (relógio fixo, sessão de admin fixa, rate limit sempre
 * permitindo, log descartado) — mesma técnica de injeção que
 * `src/server/http/handler.test.ts` usa, sem tocar Redis/Supabase/console de
 * verdade. `registrarAuditoria` é mockado à parte (mesmo padrão de
 * `marcacoes-admin.test.ts`) para inspecionar o evento sem gravar no banco.
 *
 * Env vars só são setadas (mesmo padrão de `handler.test.ts`) e a rota só é
 * importada dinamicamente dentro de `beforeAll` — `route.ts` importa
 * `@/server/http/handler`, que importa `./rate-limit`, que valida
 * `src/env.ts` no import do módulo.
 */
import { beforeAll, describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import type { AtorAdmin, DependenciasHandler, criarDefineHandler as CriarDefineHandlerFn } from '@/server/http/handler';

const AGORA_FIXA = new Date('2026-09-04T12:00:00.000Z');
const ADMIN: AtorAdmin = { tipo: 'ADMIN', adminId: 'admin-1', email: 'admin@exemplo.com' };

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

interface ColaboradorFake {
  id: string;
  bloqueadoAte: Date | null;
  pinHash: string | null;
}

interface FakePrisma {
  colaborador: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  sessaoColaborador: {
    updateMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
}

function criarPrismaFake(config: { colaborador?: ColaboradorFake | null; sessoesRevogadas?: number }): FakePrisma {
  const colaborador: ColaboradorFake = config.colaborador ?? { id: '11111111-1111-1111-1111-111111111111', bloqueadoAte: new Date('2026-09-04T11:50:00Z'), pinHash: 'hash-antigo' };

  const prisma: FakePrisma = {
    colaborador: {
      findUnique: vi.fn(async () => (config.colaborador === null ? null : colaborador)),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...colaborador, ...data })),
    },
    sessaoColaborador: {
      updateMany: vi.fn(async () => ({ count: config.sessoesRevogadas ?? 2 })),
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

let criarHandlerResetarPin: typeof import('./_impl').criarHandlerResetarPin;
let registrarAuditoria: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const modulo = await import('./_impl');
  criarHandlerResetarPin = modulo.criarHandlerResetarPin;
  const auditoria = await import('@/server/audit/registrar');
  registrarAuditoria = vi.mocked(auditoria.registrarAuditoria);
});

beforeEach(() => {
  registrarAuditoria.mockClear();
});

describe('API-ADM-COL-007 POST /api/admin/colaboradores/:id/resetar-pin', () => {
  it('teste 1/2/3 — zera pinHash, revoga sessões ativas e força precisaTrocarPin', async () => {
    const prisma = criarPrismaFake({ sessoesRevogadas: 2 });
    const POST = criarHandlerResetarPin(prisma as unknown as PrismaClient);

    const response = await POST(req('http://localhost/api/admin/colaboradores/11111111-1111-1111-1111-111111111111/resetar-pin', { body: { motivo: 'Colaborador esqueceu o PIN.' } }), {
      params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }),
    });

    const corpo = await response.json();
    expect(response.status).toBe(200);
    expect(corpo).toEqual({ id: '11111111-1111-1111-1111-111111111111', pinDefinido: false, sessoesRevogadas: 2 });

    expect(prisma.colaborador.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '11111111-1111-1111-1111-111111111111' },
        data: expect.objectContaining({ pinHash: null, precisaTrocarPin: true }),
      }),
    );
    expect(prisma.sessaoColaborador.updateMany).toHaveBeenCalledWith({
      where: { colaboradorId: '11111111-1111-1111-1111-111111111111', revogadaEm: null },
      data: { revogadaEm: AGORA_FIXA },
    });
  });

  it('teste 5 — sem motivo → 422', async () => {
    const prisma = criarPrismaFake({});
    const POST = criarHandlerResetarPin(prisma as unknown as PrismaClient);

    const response = await POST(req('http://localhost/api/admin/colaboradores/11111111-1111-1111-1111-111111111111/resetar-pin', { body: {} }), {
      params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }),
    });

    expect(response.status).toBe(422);
    expect(prisma.colaborador.update).not.toHaveBeenCalled();
  });

  it('teste 6 — conta bloqueada é desbloqueada junto (tentativasFalhas/bloqueadoAte zerados)', async () => {
    const prisma = criarPrismaFake({ colaborador: { id: '11111111-1111-1111-1111-111111111111', bloqueadoAte: new Date('2099-01-01'), pinHash: 'hash-antigo' } });
    const POST = criarHandlerResetarPin(prisma as unknown as PrismaClient);

    await POST(req('http://localhost/api/admin/colaboradores/11111111-1111-1111-1111-111111111111/resetar-pin', { body: { motivo: 'Reset de rotina.' } }), {
      params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }),
    });

    expect(prisma.colaborador.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tentativasFalhas: 0, bloqueadoAte: null }) }),
    );
  });

  it('colaborador inexistente → 404', async () => {
    const prisma = criarPrismaFake({ colaborador: null });
    const POST = criarHandlerResetarPin(prisma as unknown as PrismaClient);

    const response = await POST(req('http://localhost/api/admin/colaboradores/22222222-2222-2222-2222-222222222222/resetar-pin', { body: { motivo: 'Qualquer.' } }), {
      params: Promise.resolve({ id: '22222222-2222-2222-2222-222222222222' }),
    });

    expect(response.status).toBe(404);
  });

  it('audita PIN_RESETADO com o motivo, dentro da mesma transação', async () => {
    const prisma = criarPrismaFake({});
    const POST = criarHandlerResetarPin(prisma as unknown as PrismaClient);

    await POST(req('http://localhost/api/admin/colaboradores/11111111-1111-1111-1111-111111111111/resetar-pin', { body: { motivo: 'Pedido do colaborador via suporte.' } }), {
      params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }),
    });

    expect(registrarAuditoria).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        acao: 'PIN_RESETADO',
        atorTipo: 'ADMIN',
        atorId: 'admin-1',
        entidade: 'colaborador',
        entidadeId: '11111111-1111-1111-1111-111111111111',
        payload: expect.objectContaining({ motivo: 'Pedido do colaborador via suporte.' }),
      }),
    );
  });
});
