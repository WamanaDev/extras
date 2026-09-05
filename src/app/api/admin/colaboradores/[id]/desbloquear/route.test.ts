/**
 * Testes de aceitação de `specs/04-api/admin-colaboradores/API-ADM-COL-008-desbloquear.md`.
 *
 * Mesma técnica de injeção de `resetar-pin/route.test.ts` (ver doc-comment
 * lá): `defineHandler` real trocado por `criarDefineHandler` com deps fake,
 * `registrarAuditoria` mockado à parte, rota importada dinamicamente depois
 * de setar as env vars que `@/server/http/rate-limit` valida no import.
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

interface TentativaFake {
  ip: string;
  criadoEm: Date;
  motivo: string | null;
}

interface FakePrisma {
  colaborador: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  tentativaLogin: { findMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
}

function criarPrismaFake(config: { existe?: boolean; tentativas?: TentativaFake[] }): FakePrisma {
  const existe = config.existe ?? true;
  const colaborador = { id: COLABORADOR_ID, bloqueadoAte: new Date('2099-01-01'), tentativasFalhas: 5 };

  const prisma: FakePrisma = {
    colaborador: {
      findUnique: vi.fn(async () => (existe ? colaborador : null)),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...colaborador, ...data })),
    },
    tentativaLogin: {
      findMany: vi.fn(async () => config.tentativas ?? [
        { ip: '203.0.113.9', criadoEm: new Date('2026-09-04T11:58:00Z'), motivo: 'PIN_INCORRETO' },
        { ip: '203.0.113.9', criadoEm: new Date('2026-09-04T11:57:00Z'), motivo: 'PIN_INCORRETO' },
      ]),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  return prisma;
}

function req(url: string): NextRequest {
  const headers = new Headers({ 'x-requested-with': 'fetch' });
  return new NextRequest(new URL(url, 'http://localhost'), { method: 'POST', headers });
}

let criarHandlerDesbloquear: typeof import('./_impl').criarHandlerDesbloquear;
let registrarAuditoria: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const modulo = await import('./_impl');
  criarHandlerDesbloquear = modulo.criarHandlerDesbloquear;
  const auditoria = await import('@/server/audit/registrar');
  registrarAuditoria = vi.mocked(auditoria.registrarAuditoria);
});

beforeEach(() => {
  registrarAuditoria.mockClear();
});

describe('API-ADM-COL-008 POST /api/admin/colaboradores/:id/desbloquear', () => {
  it('teste 1 — conta bloqueada é desbloqueada (tentativasFalhas/bloqueadoAte zerados)', async () => {
    const prisma = criarPrismaFake({});
    const POST = criarHandlerDesbloquear(prisma as unknown as PrismaClient);

    const response = await POST(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_ID}/desbloquear`), { params: Promise.resolve({ id: COLABORADOR_ID }) });

    expect(response.status).toBe(200);
    expect(prisma.colaborador.update).toHaveBeenCalledWith({
      where: { id: COLABORADOR_ID },
      data: { tentativasFalhas: 0, bloqueadoAte: null },
    });
    const corpo = await response.json();
    expect(corpo.bloqueado).toBe(false);
    expect(corpo.id).toBe(COLABORADOR_ID);
  });

  it('teste 2 — tentativas recentes retornadas com IP e motivo', async () => {
    const prisma = criarPrismaFake({
      tentativas: [{ ip: '198.51.100.1', criadoEm: new Date('2026-09-04T11:59:00Z'), motivo: 'PIN_INCORRETO' }],
    });
    const POST = criarHandlerDesbloquear(prisma as unknown as PrismaClient);

    const response = await POST(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_ID}/desbloquear`), { params: Promise.resolve({ id: COLABORADOR_ID }) });
    const corpo = await response.json();

    expect(corpo.tentativasRecentes).toEqual([{ ip: '198.51.100.1', criadoEm: '2026-09-04T11:59:00.000Z', motivo: 'PIN_INCORRETO' }]);
    expect(prisma.tentativaLogin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { colaboradorId: COLABORADOR_ID }, take: 10, orderBy: { criadoEm: 'desc' } }),
    );
  });

  it('teste 4 — auditoria registrada (CONTA_DESBLOQUEADA via acaoEspecifica, ver doc-comment de route.ts)', async () => {
    const prisma = criarPrismaFake({});
    const POST = criarHandlerDesbloquear(prisma as unknown as PrismaClient);

    await POST(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_ID}/desbloquear`), { params: Promise.resolve({ id: COLABORADOR_ID }) });

    expect(registrarAuditoria).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        acao: 'COLABORADOR_ALTERADO',
        atorTipo: 'ADMIN',
        atorId: 'admin-1',
        entidade: 'colaborador',
        entidadeId: COLABORADOR_ID,
        payload: { acaoEspecifica: 'CONTA_DESBLOQUEADA' },
      }),
    );
  });

  it('colaborador inexistente → 404', async () => {
    const prisma = criarPrismaFake({ existe: false });
    const POST = criarHandlerDesbloquear(prisma as unknown as PrismaClient);

    const response = await POST(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_INEXISTENTE_ID}/desbloquear`), {
      params: Promise.resolve({ id: COLABORADOR_INEXISTENTE_ID }),
    });

    expect(response.status).toBe(404);
    expect(prisma.colaborador.update).not.toHaveBeenCalled();
  });
});
