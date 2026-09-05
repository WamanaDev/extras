/**
 * API-000 — testes do pipeline de `defineHandler`.
 *
 * Cobre só a infraestrutura comum (`contrato-comum.md`) com handlers de
 * exemplo mínimos — nenhuma rota real (isso é escopo das 54 specs de
 * `04-api/*`, que herdam deste contrato). Todas as dependências de I/O
 * (relógio, sessão, rate limit, log) são injetadas via `criarDefineHandler`
 * — nenhum teste aqui toca banco, Redis ou `console` de verdade.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { erroDeNegocio, erroNaoEncontrado, ErroHttp } from './erros';
import type { DecisaoRateLimit } from './rate-limit';
import type {
  criarDefineHandler as CriarDefineHandlerFn,
  paginacaoQuerySchema as PaginacaoQuerySchemaValor,
  DependenciasHandler,
  AtorColaborador,
  AtorAdmin,
  LinhaLog,
} from './handler';

// `handler.ts` importa `./rate-limit`, que valida `src/env.ts` no import do
// módulo (mesmo padrão de `rate-limit.test.ts`) — as variáveis precisam
// existir antes do primeiro `import('./handler')` dinâmico abaixo. Nenhum
// destes valores é usado de verdade: rate limit/sessão são injetados via
// `criarDefineHandler` em todo teste deste arquivo. `import type` acima é
// apagado em tempo de compilação — só os valores abaixo, importados
// dinamicamente depois do `beforeAll`, tocam o módulo de verdade.
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

let criarDefineHandler: typeof CriarDefineHandlerFn;
let paginacaoQuerySchema: typeof PaginacaoQuerySchemaValor;

beforeAll(async () => {
  const modulo = await import('./handler');
  criarDefineHandler = modulo.criarDefineHandler;
  paginacaoQuerySchema = modulo.paginacaoQuerySchema;
});

const AGORA_FIXA = new Date('2026-09-03T10:00:00.000Z');

const COLABORADOR: AtorColaborador = { tipo: 'COLABORADOR', colaboradorId: 'colab-1', sessaoId: 'sessao-1' };
const ADMIN: AtorAdmin = { tipo: 'ADMIN', adminId: 'admin-1', email: 'admin@exemplo.com' };

const DECISAO_PERMITE: DecisaoRateLimit = { permitido: true, limite: 10, restante: 9, retryAfter: 0 };

function criarDeps(overrides: Partial<DependenciasHandler> = {}) {
  const logs: LinhaLog[] = [];
  const deps: DependenciasHandler = {
    relogio: () => AGORA_FIXA,
    resolverSessao: vi.fn(async () => null),
    verificarLimite: vi.fn(async () => DECISAO_PERMITE),
    registrarLog: (linha) => logs.push(linha),
    gerarRequestId: () => 'req-fixo-1',
    ...overrides,
  };
  return { deps, logs };
}

function req(
  url: string,
  opcoes: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): NextRequest {
  const headers = new Headers(opcoes.headers ?? {});
  const method = opcoes.method ?? 'GET';
  const init: { method: string; headers: Headers; body?: string } = { method, headers };
  if (opcoes.body !== undefined) {
    init.body = JSON.stringify(opcoes.body);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  }
  return new NextRequest(new URL(url, 'http://localhost'), init);
}

describe('defineHandler — requestId e ctx', () => {
  it('gera requestId via dependência injetada e propaga no header X-Request-Id e no corpo de sucesso via ctx', async () => {
    const { deps } = criarDeps();
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({
      ator: 'PUBLICO',
      cache: 'referencia',
      handler: async ({ ctx }) => ({ requestIdVisto: ctx.requestId, agoraVista: ctx.agora.toISOString() }),
    });

    const response = await GET(req('http://localhost/api/exemplo'), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-Id')).toBe('req-fixo-1');
    const corpo = await response.json();
    expect(corpo).toEqual({ requestIdVisto: 'req-fixo-1', agoraVista: AGORA_FIXA.toISOString() });
  });

  it('ctx.agora vem do relógio injetado, nunca de Date.now() dentro do handler (determinismo de janela)', async () => {
    const relogio = vi.fn(() => AGORA_FIXA);
    const { deps } = criarDeps({ relogio });
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({ ator: 'PUBLICO', cache: 'referencia', handler: async ({ ctx }) => ({ t: ctx.agora.getTime() }) });

    await GET(req('http://localhost/api/exemplo'), { params: Promise.resolve({}) });
    expect(relogio).toHaveBeenCalledTimes(1);
  });

  it('ip vem de x-forwarded-for (primeiro endereço da lista, proxy da Vercel)', async () => {
    const { deps } = criarDeps();
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({ ator: 'PUBLICO', cache: 'referencia', handler: async ({ ctx }) => ({ ip: ctx.ip }) });

    const response = await GET(req('http://localhost/api/exemplo', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } }), { params: Promise.resolve({}) });
    const corpo = await response.json();
    expect(corpo.ip).toBe('203.0.113.9');
  });

  it('Idempotency-Key chega em ctx quando presente, null quando ausente', async () => {
    const { deps } = criarDeps();
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({ ator: 'PUBLICO', cache: 'referencia', handler: async ({ ctx }) => ({ chave: ctx.idempotencyKey }) });

    const comChave = await GET(req('http://localhost/api/exemplo', { headers: { 'idempotency-key': 'abc-123' } }), { params: Promise.resolve({}) });
    expect((await comChave.json()).chave).toBe('abc-123');

    const semChave = await GET(req('http://localhost/api/exemplo'), { params: Promise.resolve({}) });
    expect((await semChave.json()).chave).toBeNull();
  });
});

describe('defineHandler — rate limit', () => {
  it('roda antes da autenticação e recusa com 429 + Retry-After quando o limite estoura', async () => {
    const resolverSessao = vi.fn(async () => COLABORADOR);
    const verificarLimite = vi.fn(async (): Promise<DecisaoRateLimit> => ({ permitido: false, limite: 10, restante: 0, retryAfter: 42 }));
    const { deps } = criarDeps({ resolverSessao, verificarLimite });
    const defineHandler = criarDefineHandler(deps);
    const POST = defineHandler({
      ator: 'COLABORADOR',
      rateLimit: { escopo: 'marcacoes_por_sessao' },
      handler: async () => ({ ok: true }),
    });

    const response = await POST(req('http://localhost/api/marcacoes', { method: 'POST', headers: { 'x-requested-with': 'fetch' } }), { params: Promise.resolve({}) });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    // Recusado no rate limit — autenticação nem deveria ter rodado.
    expect(resolverSessao).not.toHaveBeenCalled();
    const corpo = await response.json();
    expect(corpo.erro).toBe('LIMITE_EXCEDIDO');
    expect(corpo.requestId).toBe('req-fixo-1');
  });

  it('identificador customizado recebe ip e request (não a sessão — rate limit roda antes da autenticação)', async () => {
    const verificarLimite = vi.fn(async () => DECISAO_PERMITE);
    const { deps } = criarDeps({ verificarLimite, resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const POST = defineHandler({
      ator: 'COLABORADOR',
      rateLimit: { escopo: 'marcacoes_por_sessao', identificador: ({ ip }) => `custom:${ip}` },
      handler: async () => ({ ok: true }),
    });

    await POST(
      req('http://localhost/api/marcacoes', {
        method: 'POST',
        headers: { 'x-requested-with': 'fetch', 'x-forwarded-for': '9.9.9.9' },
      }),
      { params: Promise.resolve({}) },
    );
    expect(verificarLimite).toHaveBeenCalledWith('marcacoes_por_sessao', 'custom:9.9.9.9');
  });
});

describe('defineHandler — autenticação e autorização', () => {
  it('ator PUBLICO não exige sessão — handler recebe ator null', async () => {
    const resolverSessao = vi.fn(async () => null);
    const { deps } = criarDeps({ resolverSessao });
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({ ator: 'PUBLICO', cache: 'referencia', handler: async ({ ator }) => ({ ator }) });

    const response = await GET(req('http://localhost/api/exemplo'), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    expect(resolverSessao).not.toHaveBeenCalled();
    expect((await response.json()).ator).toBeNull();
  });

  it('sem sessão em rota não-PUBLICO → 401 NAO_AUTENTICADO', async () => {
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => null) });
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({ ator: 'COLABORADOR', cache: 'pessoal', handler: async () => ({ ok: true }) });

    const response = await GET(req('http://localhost/api/minha-escala'), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
    expect((await response.json()).erro).toBe('NAO_AUTENTICADO');
  });

  it('sessão de admin batendo em rota ator: COLABORADOR → 403 SEM_PERMISSAO (não 401 — a sessão existe, só o papel é errado)', async () => {
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => ADMIN) });
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({ ator: 'COLABORADOR', cache: 'pessoal', handler: async () => ({ ok: true }) });

    const response = await GET(req('http://localhost/api/minha-escala'), { params: Promise.resolve({}) });
    expect(response.status).toBe(403);
    expect((await response.json()).erro).toBe('SEM_PERMISSAO');
  });

  it('sessão de colaborador batendo em rota ator: ADMIN → 403', async () => {
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({ ator: 'ADMIN', cache: 'pessoal', handler: async () => ({ ok: true }) });

    const response = await GET(req('http://localhost/api/admin/x'), { params: Promise.resolve({}) });
    expect(response.status).toBe(403);
  });

  it("ator: 'QUALQUER' aceita tanto COLABORADOR quanto ADMIN", async () => {
    for (const sessao of [COLABORADOR, ADMIN]) {
      const { deps } = criarDeps({ resolverSessao: vi.fn(async () => sessao) });
      const defineHandler = criarDefineHandler(deps);
      const GET = defineHandler({ ator: 'QUALQUER', cache: 'pessoal', handler: async ({ ator }) => ({ tipo: ator.tipo }) });
      const response = await GET(req('http://localhost/api/auth/me'), { params: Promise.resolve({}) });
      expect(response.status).toBe(200);
      expect((await response.json()).tipo).toBe(sessao.tipo);
    }
  });

  it('ator vem sempre da sessão — nunca de um campo do corpo (colaboradorId do body é ignorado)', async () => {
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const bodySchema = z.object({ colaboradorId: z.string().optional() });
    const POST = defineHandler({
      ator: 'COLABORADOR',
      body: bodySchema,
      handler: async ({ ator, body }) => ({
        colaboradorIdUsado: ator.colaboradorId,
        colaboradorIdDoBodyFoiIgnorado: body.colaboradorId !== ator.colaboradorId,
      }),
    });

    const response = await POST(
      req('http://localhost/api/marcacoes', {
        method: 'POST',
        headers: { 'x-requested-with': 'fetch' },
        body: { colaboradorId: 'outro-colaborador-tentando-se-passar' },
      }),
      { params: Promise.resolve({}) },
    );
    const corpo = await response.json();
    expect(corpo.colaboradorIdUsado).toBe('colab-1');
    expect(corpo.colaboradorIdDoBodyFoiIgnorado).toBe(true);
  });

  it('config.autorizar adicional pode recusar com erroNaoEncontrado (recurso de terceiro → 404, nunca 403)', async () => {
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const paramsSchema = z.object({ marcacaoId: z.string() });
    const GET = defineHandler({
      ator: 'COLABORADOR',
      params: paramsSchema,
      cache: 'pessoal',
      autorizar: async () => {
        throw erroNaoEncontrado();
      },
      handler: async () => ({ nuncaChega: true }),
    });

    const response = await GET(req('http://localhost/api/marcacoes/m1'), { params: Promise.resolve({ marcacaoId: 'm1' }) });
    expect(response.status).toBe(404);
    expect((await response.json()).erro).toBe('RECURSO_NAO_ENCONTRADO');
  });
});

describe('defineHandler — CSRF (SEC-INT)', () => {
  it('mutação sem X-Requested-With: fetch → 403, handler nunca roda', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const POST = defineHandler({ ator: 'COLABORADOR', handler });

    const response = await POST(req('http://localhost/api/marcacoes', { method: 'POST' }), { params: Promise.resolve({}) });
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('mutação com Content-Type application/x-www-form-urlencoded → 403', async () => {
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const POST = defineHandler({ ator: 'COLABORADOR', handler: async () => ({ ok: true }) });

    const response = await POST(
      req('http://localhost/api/marcacoes', {
        method: 'POST',
        headers: { 'x-requested-with': 'fetch', 'content-type': 'application/x-www-form-urlencoded' },
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(403);
  });

  it('GET não exige X-Requested-With (CSRF só se aplica a mutação)', async () => {
    const { deps } = criarDeps();
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({ ator: 'PUBLICO', cache: 'referencia', handler: async () => ({ ok: true }) });
    const response = await GET(req('http://localhost/api/exemplo'), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
  });
});

describe('defineHandler — validação Zod', () => {
  it('body inválido → 422 VALIDACAO com detalhes por campo', async () => {
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const bodySchema = z.object({ plantaoId: z.string().uuid() });
    const POST = defineHandler({ ator: 'COLABORADOR', body: bodySchema, handler: async () => ({ ok: true }) });

    const response = await POST(
      req('http://localhost/api/marcacoes', {
        method: 'POST',
        headers: { 'x-requested-with': 'fetch' },
        body: { plantaoId: 'não-é-uuid' },
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
    const corpo = await response.json();
    expect(corpo.erro).toBe('VALIDACAO');
    expect(corpo.detalhes).toHaveProperty('plantaoId');
    expect(corpo.requestId).toBe('req-fixo-1');
  });

  it('corpo que não é JSON válido → 422, não 500', async () => {
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const POST = defineHandler({ ator: 'COLABORADOR', body: z.object({ x: z.string() }), handler: async () => ({ ok: true }) });

    const requestCrua = new NextRequest(new URL('http://localhost/api/marcacoes'), {
      method: 'POST',
      headers: { 'x-requested-with': 'fetch', 'content-type': 'application/json' },
      body: '{ json quebrado',
    });
    const response = await POST(requestCrua, { params: Promise.resolve({}) });
    expect(response.status).toBe(422);
  });

  it('query inválida → 422', async () => {
    const { deps } = criarDeps();
    const defineHandler = criarDefineHandler(deps);
    const querySchema = z.object({ ano: z.coerce.number().int() });
    const GET = defineHandler({ ator: 'PUBLICO', query: querySchema, cache: 'referencia', handler: async () => ({ ok: true }) });

    const response = await GET(req('http://localhost/api/exemplo?ano=abc'), { params: Promise.resolve({}) });
    expect(response.status).toBe(422);
  });

  it('params inválidos → 422', async () => {
    const { deps } = criarDeps();
    const defineHandler = criarDefineHandler(deps);
    const paramsSchema = z.object({ id: z.string().uuid() });
    const GET = defineHandler({ ator: 'PUBLICO', params: paramsSchema, cache: 'referencia', handler: async () => ({ ok: true }) });

    const response = await GET(req('http://localhost/api/exemplo/x'), { params: Promise.resolve({ id: 'não-uuid' }) });
    expect(response.status).toBe(422);
  });
});

describe('defineHandler — erro de negócio e tradução de erro', () => {
  it('handler lança erroDeNegocio → 409', async () => {
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const POST = defineHandler({
      ator: 'COLABORADOR',
      handler: async () => {
        throw erroDeNegocio('Você excedeu 24h seguidas nesse período.', 'JA_MARCADO');
      },
    });

    const response = await POST(req('http://localhost/api/marcacoes', { method: 'POST', headers: { 'x-requested-with': 'fetch' } }), { params: Promise.resolve({}) });
    expect(response.status).toBe(409);
    const corpo = await response.json();
    expect(corpo.erro).toBe('JA_MARCADO');
    expect(corpo.mensagem).toBe('Você excedeu 24h seguidas nesse período.');
  });

  it('erro do driver Postgres (SQLSTATE) é traduzido via db/erros.ts — handler não lê SQLSTATE', async () => {
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const POST = defineHandler({
      ator: 'COLABORADOR',
      handler: async () => {
        const erroPostgres = { code: 'P2010', meta: { code: '23505', constraint: 'marcacao_unica_confirmada' } };
        throw erroPostgres;
      },
    });

    const response = await POST(req('http://localhost/api/marcacoes', { method: 'POST', headers: { 'x-requested-with': 'fetch' } }), { params: Promise.resolve({}) });
    expect(response.status).toBe(409);
    expect((await response.json()).erro).toBe('JA_MARCADO');
  });

  it('erro de lock timeout (55P03) vira 503 com Retry-After', async () => {
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const POST = defineHandler({
      ator: 'COLABORADOR',
      handler: async () => {
        throw { meta: { code: '55P03' } };
      },
    });

    const response = await POST(req('http://localhost/api/marcacoes', { method: 'POST', headers: { 'x-requested-with': 'fetch' } }), { params: Promise.resolve({}) });
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('1');
  });

  it('erro desconhecido/bug → 500 ERRO_INTERNO com mensagem genérica (nunca stack/detalhe técnico na resposta)', async () => {
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const POST = defineHandler({
      ator: 'COLABORADOR',
      handler: async () => {
        throw new Error('detalhe técnico sensível: SELECT * FROM colaborador WHERE cpf=...');
      },
    });

    const response = await POST(req('http://localhost/api/marcacoes', { method: 'POST', headers: { 'x-requested-with': 'fetch' } }), { params: Promise.resolve({}) });
    expect(response.status).toBe(500);
    const corpo = await response.json();
    expect(corpo.erro).toBe('ERRO_INTERNO');
    expect(corpo.mensagem).not.toContain('cpf');
    expect(corpo.mensagem).not.toContain('SELECT');
  });

  it('resposta de erro sempre tem X-Request-Id e Cache-Control: no-store', async () => {
    const { deps } = criarDeps();
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({ ator: 'PUBLICO', cache: 'referencia', handler: async () => { throw new Error('boom'); } });
    const response = await GET(req('http://localhost/api/exemplo'), { params: Promise.resolve({}) });
    expect(response.headers.get('X-Request-Id')).toBe('req-fixo-1');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('defineHandler — cache (contrato-comum.md)', () => {
  it.each([
    ['mutacao', 'no-store'],
    ['pessoal', 'private, no-store'],
    ['grade-extras', 'private, max-age=5'],
    ['referencia', 'private, max-age=300'],
  ] as const)('cache: %s → Cache-Control: %s', async (tipoCache, esperado) => {
    const { deps } = criarDeps();
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({ ator: 'PUBLICO', cache: tipoCache, handler: async () => ({ ok: true }) });
    const response = await GET(req('http://localhost/api/exemplo'), { params: Promise.resolve({}) });
    expect(response.headers.get('Cache-Control')).toBe(esperado);
  });

  it('mutação sem cache explícito usa no-store por padrão', async () => {
    const { deps } = criarDeps({ resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const POST = defineHandler({ ator: 'COLABORADOR', handler: async () => ({ ok: true }) });
    const response = await POST(req('http://localhost/api/marcacoes', { method: 'POST', headers: { 'x-requested-with': 'fetch' } }), { params: Promise.resolve({}) });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('defineHandler — paginação', () => {
  it('parseia ?pagina=&tamanho=, aplica teto 200 e expõe X-Total-Count', async () => {
    const { deps } = criarDeps();
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({
      ator: 'PUBLICO',
      paginacao: true,
      cache: 'referencia',
      handler: async ({ query }) => {
        expect(query).toEqual({ pagina: 2, tamanho: 10 });
        return { itens: [{ id: 1 }, { id: 2 }], total: 37 };
      },
    });

    const response = await GET(req('http://localhost/api/exemplo?pagina=2&tamanho=10'), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Total-Count')).toBe('37');
    expect(await response.json()).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('tamanho acima do teto (200) é rejeitado pela validação', async () => {
    const { deps } = criarDeps();
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({ ator: 'PUBLICO', paginacao: true, cache: 'referencia', handler: async () => ({ itens: [], total: 0 }) });
    const response = await GET(req('http://localhost/api/exemplo?pagina=1&tamanho=201'), { params: Promise.resolve({}) });
    expect(response.status).toBe(422);
  });

  it('sem parâmetros usa pagina=1, tamanho=50 (default do schema)', async () => {
    const parsed = paginacaoQuerySchema.parse({});
    expect(parsed).toEqual({ pagina: 1, tamanho: 50 });
  });
});

describe('defineHandler — log estruturado', () => {
  it('loga requestId, atorTipo, atorId, rota, duracaoMs e status em toda requisição (sucesso e erro)', async () => {
    const { deps, logs } = criarDeps({ resolverSessao: vi.fn(async () => COLABORADOR) });
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({ ator: 'COLABORADOR', cache: 'pessoal', handler: async () => ({ ok: true }) });
    await GET(req('http://localhost/api/minha-escala'), { params: Promise.resolve({}) });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      requestId: 'req-fixo-1',
      atorTipo: 'COLABORADOR',
      atorId: 'colab-1',
      rota: '/api/minha-escala',
      metodo: 'GET',
      status: 200,
    });
    expect(typeof logs[0]?.duracaoMs).toBe('number');
  });

  it('loga mesmo quando o handler lança (status de erro registrado)', async () => {
    const { deps, logs } = criarDeps();
    const defineHandler = criarDefineHandler(deps);
    const GET = defineHandler({ ator: 'PUBLICO', cache: 'referencia', handler: async () => { throw erroDeNegocio('recusado'); } });
    await GET(req('http://localhost/api/exemplo'), { params: Promise.resolve({}) });

    expect(logs).toHaveLength(1);
    expect(logs[0]?.status).toBe(409);
    expect(logs[0]?.atorTipo).toBe('PUBLICO');
    expect(logs[0]?.atorId).toBeNull();
  });
});

describe('ErroHttp — instância repassada intacta pela tradução', () => {
  it('traduzirErro (via pipeline) preserva um ErroHttp lançado pelo handler', async () => {
    const { deps } = criarDeps();
    const defineHandler = criarDefineHandler(deps);
    const erroOriginal = erroNaoEncontrado('Plantão não encontrado.');
    const GET = defineHandler({ ator: 'PUBLICO', cache: 'referencia', handler: async () => { throw erroOriginal; } });
    const response = await GET(req('http://localhost/api/exemplo'), { params: Promise.resolve({}) });
    expect(response.status).toBe(404);
    expect((await response.json()).mensagem).toBe('Plantão não encontrado.');
    expect(erroOriginal).toBeInstanceOf(ErroHttp);
  });
});
