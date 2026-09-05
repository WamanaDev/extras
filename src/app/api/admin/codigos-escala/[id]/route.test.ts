/**
 * Testes de `PATCH`/`DELETE /api/admin/codigos-escala/:id`.
 * DOM-003.6 (revisado): código `bloqueado` (D/F/FE) não aceita nenhuma das
 * duas operações; `bloqueado` em si nunca é alterável via API.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import type { AtorAdmin, DependenciasHandler, criarDefineHandler as CriarDefineHandlerFn } from '@/server/http/handler';

const AGORA_FIXA = new Date('2026-09-04T12:00:00.000Z');
const ADMIN: AtorAdmin = { tipo: 'ADMIN', adminId: 'admin-1', email: 'admin@exemplo.com' };
const CODIGO_ID = '11111111-1111-1111-1111-111111111111';
const INEXISTENTE_ID = '22222222-2222-2222-2222-222222222222';

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
  codigoEscala: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  escalaDia: { count: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
}

function criarPrismaFake(config: { existe?: boolean; bloqueado?: boolean; emUso?: number } = {}): FakePrisma {
  const existe = config.existe ?? true;
  const registro = { id: CODIGO_ID, codigo: 'ATESTADO', bloqueado: config.bloqueado ?? false };
  const prisma: FakePrisma = {
    codigoEscala: {
      findUnique: vi.fn(async () => (existe ? registro : null)),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...registro, ...data })),
    },
    escalaDia: { count: vi.fn(async () => config.emUso ?? 0) },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  return prisma;
}

function req(url: string, opcoes: { method: string; body?: unknown }): NextRequest {
  const headers = new Headers({ 'x-requested-with': 'fetch', 'content-type': 'application/json' });
  const init: { method: string; headers: Headers; body?: string } = { method: opcoes.method, headers };
  if (opcoes.body !== undefined) init.body = JSON.stringify(opcoes.body);
  return new NextRequest(new URL(url, 'http://localhost'), init);
}

let criarHandlerAtualizar: typeof import('./_impl').criarHandlerAtualizar;
let criarHandlerDesativar: typeof import('./_impl').criarHandlerDesativar;
let registrarAuditoria: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const modulo = await import('./_impl');
  criarHandlerAtualizar = modulo.criarHandlerAtualizar;
  criarHandlerDesativar = modulo.criarHandlerDesativar;
  const auditoria = await import('@/server/audit/registrar');
  registrarAuditoria = vi.mocked(auditoria.registrarAuditoria);
});

beforeEach(() => {
  registrarAuditoria.mockClear();
});

describe('PATCH /api/admin/codigos-escala/:id', () => {
  it('altera descrição/flags/cor de um código não-bloqueado', async () => {
    const prisma = criarPrismaFake({ bloqueado: false });
    const PATCH = criarHandlerAtualizar(prisma as unknown as PrismaClient);

    const response = await PATCH(req(`http://localhost/api/admin/codigos-escala/${CODIGO_ID}`, { method: 'PATCH', body: { descricao: 'Atestado' } }), {
      params: Promise.resolve({ id: CODIGO_ID }),
    });

    expect(response.status).toBe(200);
    expect(prisma.codigoEscala.update).toHaveBeenCalledWith({ where: { id: CODIGO_ID }, data: { descricao: 'Atestado' } });
    expect(registrarAuditoria).toHaveBeenCalledWith(prisma, expect.objectContaining({ acao: 'CODIGO_ESCALA_ALTERADO' }));
  });

  it('código bloqueado (D/F/FE) → erro de negócio, não altera descrição/flags', async () => {
    const prisma = criarPrismaFake({ bloqueado: true });
    const PATCH = criarHandlerAtualizar(prisma as unknown as PrismaClient);

    const response = await PATCH(req(`http://localhost/api/admin/codigos-escala/${CODIGO_ID}`, { method: 'PATCH', body: { descricao: 'Nova' } }), {
      params: Promise.resolve({ id: CODIGO_ID }),
    });

    expect(response.status).toBe(409);
    expect(prisma.codigoEscala.update).not.toHaveBeenCalled();
  });

  it('código bloqueado (D/F/FE) aceita PATCH só de `cor` (pedido do usuário)', async () => {
    const prisma = criarPrismaFake({ bloqueado: true });
    const PATCH = criarHandlerAtualizar(prisma as unknown as PrismaClient);

    const response = await PATCH(req(`http://localhost/api/admin/codigos-escala/${CODIGO_ID}`, { method: 'PATCH', body: { cor: '#123456' } }), {
      params: Promise.resolve({ id: CODIGO_ID }),
    });

    expect(response.status).toBe(200);
    expect(prisma.codigoEscala.update).toHaveBeenCalledWith({ where: { id: CODIGO_ID }, data: { cor: '#123456' } });
  });

  it('código bloqueado (D/F/FE) com `cor` + outro campo no mesmo PATCH → erro de negócio, não altera nada', async () => {
    const prisma = criarPrismaFake({ bloqueado: true });
    const PATCH = criarHandlerAtualizar(prisma as unknown as PrismaClient);

    const response = await PATCH(req(`http://localhost/api/admin/codigos-escala/${CODIGO_ID}`, { method: 'PATCH', body: { cor: '#123456', descricao: 'Nova' } }), {
      params: Promise.resolve({ id: CODIGO_ID }),
    });

    expect(response.status).toBe(409);
    expect(prisma.codigoEscala.update).not.toHaveBeenCalled();
  });

  it('`bloqueado` no corpo é rejeitado (`.strict()`) — não existe jeito de alterar essa coluna via API', async () => {
    const prisma = criarPrismaFake({ bloqueado: false });
    const PATCH = criarHandlerAtualizar(prisma as unknown as PrismaClient);

    const response = await PATCH(req(`http://localhost/api/admin/codigos-escala/${CODIGO_ID}`, { method: 'PATCH', body: { bloqueado: false } }), {
      params: Promise.resolve({ id: CODIGO_ID }),
    });

    expect(response.status).toBe(422);
  });

  it('código inexistente → 404', async () => {
    const prisma = criarPrismaFake({ existe: false });
    const PATCH = criarHandlerAtualizar(prisma as unknown as PrismaClient);

    const response = await PATCH(req(`http://localhost/api/admin/codigos-escala/${INEXISTENTE_ID}`, { method: 'PATCH', body: { descricao: 'x' } }), {
      params: Promise.resolve({ id: INEXISTENTE_ID }),
    });

    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/admin/codigos-escala/:id (desativação — DOM-003.5)', () => {
  it('desativa (ativo=false) um código não-bloqueado, mesmo em uso', async () => {
    const prisma = criarPrismaFake({ bloqueado: false, emUso: 5 });
    const DELETE = criarHandlerDesativar(prisma as unknown as PrismaClient);

    const response = await DELETE(req(`http://localhost/api/admin/codigos-escala/${CODIGO_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: CODIGO_ID }),
    });

    expect(response.status).toBe(200);
    expect(prisma.codigoEscala.update).toHaveBeenCalledWith({ where: { id: CODIGO_ID }, data: { ativo: false } });
    expect(registrarAuditoria).toHaveBeenCalledWith(prisma, expect.objectContaining({ acao: 'CODIGO_ESCALA_DESATIVADO', payload: expect.objectContaining({ emUso: true }) }));
  });

  it('código bloqueado (D/F/FE) → erro de negócio, não desativa', async () => {
    const prisma = criarPrismaFake({ bloqueado: true });
    const DELETE = criarHandlerDesativar(prisma as unknown as PrismaClient);

    const response = await DELETE(req(`http://localhost/api/admin/codigos-escala/${CODIGO_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: CODIGO_ID }),
    });

    expect(response.status).toBe(409);
    expect(prisma.codigoEscala.update).not.toHaveBeenCalled();
  });

  it('código inexistente → 404', async () => {
    const prisma = criarPrismaFake({ existe: false });
    const DELETE = criarHandlerDesativar(prisma as unknown as PrismaClient);

    const response = await DELETE(req(`http://localhost/api/admin/codigos-escala/${INEXISTENTE_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: INEXISTENTE_ID }),
    });

    expect(response.status).toBe(404);
  });
});
