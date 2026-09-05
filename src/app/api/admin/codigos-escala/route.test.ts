/**
 * Testes de `GET`/`POST /api/admin/codigos-escala` — mesma técnica de injeção
 * de Prisma fake usada em `colaboradores/[id]/revogar-sessoes/route.test.ts`.
 * DOM-003.6 (revisado a pedido do usuário): todo código criado nasce com
 * `bloqueado: false` — não é possível criar já bloqueado.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

interface FakePrisma {
  codigoEscala: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
}

function criarPrismaFake(config: { existeCodigo?: boolean } = {}): FakePrisma {
  const prisma: FakePrisma = {
    codigoEscala: {
      findMany: vi.fn(async () => [
        { id: 'c1', codigo: 'D', descricao: 'Disponível', presenca: true, ocupaHorario: true, remunerada: true, ativo: true, bloqueado: true, cor: '#2E7D32' },
        { id: 'c2', codigo: 'ATESTADO', descricao: 'Atestado médico', presenca: false, ocupaHorario: true, remunerada: true, ativo: true, bloqueado: false, cor: '#B71C1C' },
      ]),
      findFirst: vi.fn(async () => (config.existeCodigo ? { id: 'existente' } : null)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'novo-1', ...data })),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  return prisma;
}

function req(url: string, opcoes: { method?: string; body?: unknown } = {}): NextRequest {
  const headers = new Headers({ 'x-requested-with': 'fetch', 'content-type': 'application/json' });
  const init: { method: string; headers: Headers; body?: string } = { method: opcoes.method ?? 'GET', headers };
  if (opcoes.body !== undefined) init.body = JSON.stringify(opcoes.body);
  return new NextRequest(new URL(url, 'http://localhost'), init);
}

let criarHandlerListar: typeof import('./_impl').criarHandlerListar;
let criarHandlerCriar: typeof import('./_impl').criarHandlerCriar;
let registrarAuditoria: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const modulo = await import('./_impl');
  criarHandlerListar = modulo.criarHandlerListar;
  criarHandlerCriar = modulo.criarHandlerCriar;
  const auditoria = await import('@/server/audit/registrar');
  registrarAuditoria = vi.mocked(auditoria.registrarAuditoria);
});

beforeEach(() => {
  registrarAuditoria.mockClear();
});

describe('GET /api/admin/codigos-escala', () => {
  it('lista só ativos por padrão, com todos os campos (bloqueado incluso)', async () => {
    const prisma = criarPrismaFake();
    const GET = criarHandlerListar(prisma as unknown as PrismaClient);

    const response = await GET(req('http://localhost/api/admin/codigos-escala'), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(prisma.codigoEscala.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ativo: true } }));
    const corpo = await response.json();
    expect(corpo.itens).toEqual(
      expect.arrayContaining([expect.objectContaining({ codigo: 'D', bloqueado: true }), expect.objectContaining({ codigo: 'ATESTADO', bloqueado: false })]),
    );
  });

  it('?todos=true traz também desativados (tela de gestão)', async () => {
    const prisma = criarPrismaFake();
    const GET = criarHandlerListar(prisma as unknown as PrismaClient);

    await GET(req('http://localhost/api/admin/codigos-escala?todos=true'), { params: Promise.resolve({}) });

    expect(prisma.codigoEscala.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});

describe('POST /api/admin/codigos-escala', () => {
  const CORPO_VALIDO = { codigo: 'atestado', descricao: 'Atestado médico', presenca: false, ocupaHorario: true, remunerada: true, cor: '#B71C1C' };

  it('cria um código novo, sempre com bloqueado=false, maiusculizando o código', async () => {
    const prisma = criarPrismaFake();
    const POST = criarHandlerCriar(prisma as unknown as PrismaClient);

    const response = await POST(req('http://localhost/api/admin/codigos-escala', { method: 'POST', body: CORPO_VALIDO }), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(prisma.codigoEscala.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ codigo: 'ATESTADO', bloqueado: false, ativo: true }),
    });
  });

  it('audita CODIGO_ESCALA_CRIADO', async () => {
    const prisma = criarPrismaFake();
    const POST = criarHandlerCriar(prisma as unknown as PrismaClient);

    await POST(req('http://localhost/api/admin/codigos-escala', { method: 'POST', body: CORPO_VALIDO }), { params: Promise.resolve({}) });

    expect(registrarAuditoria).toHaveBeenCalledWith(prisma, expect.objectContaining({ acao: 'CODIGO_ESCALA_CRIADO', entidade: 'codigo_escala' }));
  });

  it('código já existente → erro de negócio, não cria', async () => {
    const prisma = criarPrismaFake({ existeCodigo: true });
    const POST = criarHandlerCriar(prisma as unknown as PrismaClient);

    const response = await POST(req('http://localhost/api/admin/codigos-escala', { method: 'POST', body: CORPO_VALIDO }), { params: Promise.resolve({}) });

    expect(response.status).toBe(409);
    expect(prisma.codigoEscala.create).not.toHaveBeenCalled();
  });

  it('cor fora do formato hexadecimal → 422', async () => {
    const prisma = criarPrismaFake();
    const POST = criarHandlerCriar(prisma as unknown as PrismaClient);

    const response = await POST(req('http://localhost/api/admin/codigos-escala', { method: 'POST', body: { ...CORPO_VALIDO, cor: 'vermelho' } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(422);
    expect(prisma.codigoEscala.create).not.toHaveBeenCalled();
  });

  it('body não aceita `bloqueado` (rejeitado por `.strict()`) — não existe jeito de criar já bloqueado', async () => {
    const prisma = criarPrismaFake();
    const POST = criarHandlerCriar(prisma as unknown as PrismaClient);

    const response = await POST(
      req('http://localhost/api/admin/codigos-escala', { method: 'POST', body: { ...CORPO_VALIDO, bloqueado: true } }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(422);
  });
});
