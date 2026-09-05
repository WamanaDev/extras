/**
 * Testes de rota de `API-ADM-ESC-001` — `GET /api/admin/ciclos/:id/escala`.
 *
 * Cobre a parte da tabela "Testes de aceitação" que é responsabilidade do
 * pipeline de rota, não da montagem/consulta pura (já cobertas em
 * `grade.test.ts`/`consulta.test.ts`): #6 (colaborador chamando → 403) e o
 * caminho de ciclo inexistente → 404. Usa `criarDefineHandler` (a mesma
 * fábrica injetável que `API-000`/`handler.test.ts` expõe para isso) para
 * substituir `defineHandler` por uma variante com sessão/rate-limit/relógio
 * controlados, sem tocar banco/Redis/Supabase de verdade — o pipeline em si
 * (validação, serialização, cache) continua sendo o código real.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { AtorAdmin, AtorColaborador, SessaoResolvida } from '@/server/http/handler';
import type { GradeSaida } from '@/server/services/escala-admin/grade';

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

const ADMIN: AtorAdmin = { tipo: 'ADMIN', adminId: 'admin-1', email: null };
const COLABORADOR: AtorColaborador = { tipo: 'COLABORADOR', colaboradorId: 'colab-1', sessaoId: 'sessao-1' };

let sessaoAtual: SessaoResolvida | null = ADMIN;

vi.mock('@/server/http/handler', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/server/http/handler')>();
  const fakeDefineHandler = real.criarDefineHandler({
    relogio: () => new Date('2026-09-03T10:00:00-03:00'),
    resolverSessao: async () => sessaoAtual,
    verificarLimite: async () => ({ permitido: true, limite: 10, restante: 9, retryAfter: 0 }),
    registrarLog: () => {},
    gerarRequestId: () => 'req-1',
  });
  return { ...real, defineHandler: fakeDefineHandler };
});

const CICLO_ID = '11111111-1111-1111-1111-111111111111';
const CICLO_ID_INEXISTENTE = '22222222-2222-2222-2222-222222222222';

const GRADE_FIXTURE: GradeSaida = {
  ciclo: { ano: 2026, mes: 9, dias: 30 },
  colaboradores: [],
  codigos: [],
  coberturaPorDia: {},
};

const buscarGradeMock = vi.fn(async (_tx: unknown, cicloId: string) => (cicloId === CICLO_ID ? GRADE_FIXTURE : null));

vi.mock('@/server/services/escala-admin/consulta', () => ({
  buscarGrade: (...args: Parameters<typeof buscarGradeMock>) => buscarGradeMock(...args),
}));

vi.mock('@/server/db/client', () => ({
  obterPrisma: async () => ({
    $transaction: (callback: (tx: unknown) => unknown) => callback({}),
  }),
}));

function req(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET', headers: new Headers() });
}

describe('GET /api/admin/ciclos/:id/escala — API-ADM-ESC-001', () => {
  beforeEach(() => {
    sessaoAtual = ADMIN;
    buscarGradeMock.mockClear();
  });

  it('6. colaborador chamando a rota → 403', async () => {
    sessaoAtual = COLABORADOR;
    const { GET } = await import('./route');

    const resposta = await GET(req(`http://localhost/api/admin/ciclos/${CICLO_ID}/escala`), { params: Promise.resolve({ id: CICLO_ID }) });

    expect(resposta.status).toBe(403);
  });

  it('admin autorizado: 200 com a grade, cache `private, no-store` (dado pessoal)', async () => {
    const { GET } = await import('./route');

    const resposta = await GET(req(`http://localhost/api/admin/ciclos/${CICLO_ID}/escala`), { params: Promise.resolve({ id: CICLO_ID }) });

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Cache-Control')).toBe('private, no-store');
    const corpo = await resposta.json();
    expect(corpo.ciclo).toEqual({ ano: 2026, mes: 9, dias: 30 });
  });

  it('ciclo inexistente → 404', async () => {
    const { GET } = await import('./route');

    const resposta = await GET(req(`http://localhost/api/admin/ciclos/${CICLO_ID_INEXISTENTE}/escala`), { params: Promise.resolve({ id: CICLO_ID_INEXISTENTE }) });

    expect(resposta.status).toBe(404);
  });

  it('filtro `?rt=` repassado a `buscarGrade`', async () => {
    const { GET } = await import('./route');
    const rtId = '33333333-3333-3333-3333-333333333333';

    await GET(req(`http://localhost/api/admin/ciclos/${CICLO_ID}/escala?rt=${rtId}`), { params: Promise.resolve({ id: CICLO_ID }) });

    expect(buscarGradeMock).toHaveBeenCalledWith(expect.anything(), CICLO_ID, { rt: rtId, turno: undefined });
  });
});
