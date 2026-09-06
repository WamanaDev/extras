/**
 * `resolverSessaoPadrao` (`handler.ts`) — foco só na PRIORIDADE entre
 * colaborador/admin quando os dois cookies existem no mesmo navegador
 * (achado em uso real: rota `ator: 'ADMIN'` derrubada com `403
 * SEM_PERMISSAO` porque o resolvedor sempre testava colaborador primeiro,
 * incondicionalmente, e nunca chegava a checar o cookie de admin — ver
 * `_conflitos.md`). Mocka os dois lados (Prisma pro colaborador, Supabase
 * pro admin) pra montar os quatro cenários combinando "cookie presente e
 * válido" × "ausente".
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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

const SESSAO_COLABORADOR_VALIDA = {
  id: 'sessao-1',
  colaboradorId: 'colab-1',
  revogadaEm: null,
  expiraEm: new Date(Date.now() + 60_000),
};

const findFirstMock = vi.fn(async (_args: unknown) => SESSAO_COLABORADOR_VALIDA as typeof SESSAO_COLABORADOR_VALIDA | null);
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    sessaoColaborador = { findFirst: (args: unknown) => findFirstMock(args) };
  },
}));

const getUserMock = vi.fn(async () => ({ data: { user: null as { id: string; email: string } | null }, error: null as unknown }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: () => getUserMock() } }),
}));

function req(cookies: Record<string, string>): NextRequest {
  const cookieHeader = Object.entries(cookies)
    .map(([nome, valor]) => `${nome}=${valor}`)
    .join('; ');
  return new NextRequest(new URL('http://localhost/api/admin/x'), { headers: { cookie: cookieHeader } });
}

let resolverSessaoPadrao: typeof import('./handler').resolverSessaoPadrao;

beforeAll(async () => {
  resolverSessaoPadrao = (await import('./handler')).resolverSessaoPadrao;
});

beforeEach(() => {
  findFirstMock.mockClear();
  getUserMock.mockClear();
  findFirstMock.mockResolvedValue(SESSAO_COLABORADOR_VALIDA);
  getUserMock.mockResolvedValue({ data: { user: null }, error: null });
});

describe('resolverSessaoPadrao — prioridade quando os dois cookies existem', () => {
  it('atorEsperado ADMIN: com cookie de colaborador E de admin válidos, a sessão de ADMIN vence (não derruba mais rota admin com SEM_PERMISSAO)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@exemplo.com' } }, error: null });

    const sessao = await resolverSessaoPadrao(req({ sessao_colaborador: 'token-valido' }), '127.0.0.1', 'ADMIN');

    expect(sessao?.tipo).toBe('ADMIN');
  });

  it('atorEsperado ADMIN: sem cookie de admin válido, cai pro colaborador em vez de negar tudo', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const sessao = await resolverSessaoPadrao(req({ sessao_colaborador: 'token-valido' }), '127.0.0.1', 'ADMIN');

    expect(sessao?.tipo).toBe('COLABORADOR');
  });

  it('atorEsperado COLABORADOR: com os dois cookies válidos, a sessão de COLABORADOR vence', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@exemplo.com' } }, error: null });

    const sessao = await resolverSessaoPadrao(req({ sessao_colaborador: 'token-valido' }), '127.0.0.1', 'COLABORADOR');

    expect(sessao?.tipo).toBe('COLABORADOR');
  });

  it('nenhum cookie válido → null, independente do ator esperado', async () => {
    findFirstMock.mockResolvedValue(null);
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    expect(await resolverSessaoPadrao(req({}), '127.0.0.1', 'ADMIN')).toBeNull();
    expect(await resolverSessaoPadrao(req({}), '127.0.0.1', 'COLABORADOR')).toBeNull();
  });
});
