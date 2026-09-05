import { describe, it, expect, vi, afterEach } from 'vitest';

const cookiesMock = vi.fn();
const headersMock = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => cookiesMock(),
  headers: () => headersMock(),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('getServidor — fetch de Server Component com cookies repassados', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('repassa os cookies da requisição atual e monta a URL a partir do host', async () => {
    cookiesMock.mockResolvedValue({
      getAll: () => [{ name: 'sessao_colaborador', value: 'tok123' }],
    });
    headersMock.mockResolvedValue(new Map([['host', 'app.exemplo.com'], ['x-forwarded-proto', 'https']]));

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { ok: true }));

    const { getServidor } = await import('./servidor');
    const resultado = await getServidor<{ ok: boolean }>('/api/auth/me');

    expect(resultado).toEqual({ ok: true, status: 200, dados: { ok: true }, headers: expect.any(Headers) });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.exemplo.com/api/auth/me',
      expect.objectContaining({ method: 'GET', headers: { cookie: 'sessao_colaborador=tok123' } }),
    );
  });

  it('devolve o envelope de erro da API quando a resposta não é ok', async () => {
    cookiesMock.mockResolvedValue({ getAll: () => [] });
    headersMock.mockResolvedValue(new Map([['host', 'localhost:3000']]));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(401, { erro: 'NAO_AUTENTICADO', mensagem: 'Sessão inválida.', detalhes: null, requestId: 'r1' }),
    );

    const { getServidor } = await import('./servidor');
    const resultado = await getServidor<unknown>('/api/auth/me');

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.status).toBe(401);
      expect(resultado.erro.mensagem).toBe('Sessão inválida.');
    }
  });

  it('falha de rede vira um ErroApi genérico, nunca lança (para o Server Component sempre renderizar algo)', async () => {
    cookiesMock.mockResolvedValue({ getAll: () => [] });
    headersMock.mockResolvedValue(new Map([['host', 'localhost:3000']]));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const { getServidor } = await import('./servidor');
    const resultado = await getServidor<unknown>('/api/auth/me');

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.erro.erro).toBe('ERRO_DESCONHECIDO');
    }
  });
});
