/**
 * Testes de `google-calendar.ts` — pedido do usuário: sincronizar escala +
 * extras na agenda pessoal via OAuth do Google. Cobre cifra/decifra do
 * refresh token (precisa ser reversível, diferente de hash de PIN/senha),
 * montagem da URL de autorização, e o upsert de evento (create-ou-update).
 */
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';

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
  process.env.GOOGLE_CLIENT_ID ??= 'client-id-teste.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET ??= 'client-secret-teste';
  process.env.CALENDAR_TOKEN_KEY ??= 'a'.repeat(64);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('googleCalendarConfigurado', () => {
  it('true quando as 3 variáveis existem (setadas no beforeAll)', async () => {
    const { googleCalendarConfigurado } = await import('./google-calendar');
    expect(googleCalendarConfigurado()).toBe(true);
  });
});

describe('criptografar/descriptografar — refresh token precisa ser reversível (nunca hasheado)', () => {
  it('roundtrip: descriptografar(criptografar(x)) === x', async () => {
    const { criptografar, descriptografar } = await import('./google-calendar');
    const token = '1//0gABCDEFghijklmnopqrstuvwxyz-refresh-token-de-verdade';
    const cifrado = criptografar(token);
    expect(cifrado).not.toBe(token);
    expect(descriptografar(cifrado)).toBe(token);
  });

  it('cada chamada gera um IV diferente — cifrar o mesmo texto duas vezes dá resultados diferentes', async () => {
    const { criptografar } = await import('./google-calendar');
    const a = criptografar('mesmo-texto');
    const b = criptografar('mesmo-texto');
    expect(a).not.toBe(b);
  });

  it('formato inválido (sem os 3 segmentos) lança, nunca retorna lixo silenciosamente', async () => {
    const { descriptografar } = await import('./google-calendar');
    expect(() => descriptografar('formato-errado')).toThrow();
  });
});

describe('construirUrlAutorizacao', () => {
  it('inclui client_id, redirect_uri, scope de calendar, state, e access_type=offline + prompt=consent (garante refresh_token sempre)', async () => {
    const { construirUrlAutorizacao } = await import('./google-calendar');
    const url = new URL(construirUrlAutorizacao({ redirectUri: 'https://app.exemplo/callback', state: 'abc123' }));

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-id-teste.apps.googleusercontent.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.exemplo/callback');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.events');
    expect(url.searchParams.get('state')).toBe('abc123');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });
});

describe('idEventoEscala / idEventoExtra', () => {
  it('remove hífens do UUID e prefixa — evento determinístico (idempotência da sincronização)', async () => {
    const { idEventoEscala, idEventoExtra } = await import('./google-calendar');
    const uuid = '11111111-2222-3333-4444-555555555555';
    expect(idEventoEscala(uuid)).toBe(`esc${uuid.replace(/-/g, '')}`);
    expect(idEventoExtra(uuid)).toBe(`etr${uuid.replace(/-/g, '')}`);
  });

  it('id gerado só usa caracteres válidos pro Google (^[a-v0-9]{5,1024}$)', async () => {
    const { idEventoEscala, idEventoExtra } = await import('./google-calendar');
    const uuid = 'aabbccdd-eeff-0011-2233-445566778899';
    expect(idEventoEscala(uuid)).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(idEventoExtra(uuid)).toMatch(/^[a-v0-9]{5,1024}$/);
  });
});

describe('trocarCodigoPorTokens', () => {
  it('POSTa pro endpoint de token do Google e devolve access/refresh token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 }), { status: 200 }),
    );
    const { trocarCodigoPorTokens } = await import('./google-calendar');

    const tokens = await trocarCodigoPorTokens({ code: 'codigo-1', redirectUri: 'https://app.exemplo/callback' });

    expect(tokens).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    expect(fetchMock).toHaveBeenCalledWith('https://oauth2.googleapis.com/token', expect.objectContaining({ method: 'POST' }));
  });

  it('sem refresh_token na resposta → lança (garantia de que prompt=consent está funcionando)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ access_token: 'access-1', expires_in: 3600 }), { status: 200 }));
    const { trocarCodigoPorTokens } = await import('./google-calendar');

    await expect(trocarCodigoPorTokens({ code: 'codigo-1', redirectUri: 'https://app.exemplo/callback' })).rejects.toThrow();
  });

  it('Google recusa o code → lança com o erro repassado', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Malformed auth code.' }), { status: 400 }),
    );
    const { trocarCodigoPorTokens } = await import('./google-calendar');

    await expect(trocarCodigoPorTokens({ code: 'codigo-invalido', redirectUri: 'https://app.exemplo/callback' })).rejects.toThrow(/invalid_grant/);
  });
});

describe('obterAccessToken', () => {
  it('decifra o refresh token e troca por um access_token novo', async () => {
    const { criptografar } = await import('./google-calendar');
    const cifrado = criptografar('refresh-de-verdade');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ access_token: 'access-novo', expires_in: 3600 }), { status: 200 }));
    const { obterAccessToken } = await import('./google-calendar');

    const accessToken = await obterAccessToken(cifrado);

    expect(accessToken).toBe('access-novo');
    const [, opcoes] = fetchMock.mock.calls[0]!;
    const corpo = (opcoes as RequestInit).body as URLSearchParams;
    expect(corpo.get('refresh_token')).toBe('refresh-de-verdade');
    expect(corpo.get('grant_type')).toBe('refresh_token');
  });
});

describe('upsertEvento', () => {
  it('cria via POST quando o evento ainda não existe', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { upsertEvento } = await import('./google-calendar');

    await upsertEvento({
      accessToken: 'tok',
      calendarioId: 'primary',
      evento: { id: 'esc123', titulo: 'Plantão', inicioIso: '2026-09-19T19:00:00-03:00', fimIso: '2026-09-20T07:00:00-03:00' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/events'), expect.objectContaining({ method: 'POST' }));
  });

  it('evento já existe (409 no POST) → tenta de novo via PATCH', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 409 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const { upsertEvento } = await import('./google-calendar');

    await upsertEvento({
      accessToken: 'tok',
      calendarioId: 'primary',
      evento: { id: 'esc123', titulo: 'Plantão', inicioIso: '2026-09-19T19:00:00-03:00', fimIso: '2026-09-20T07:00:00-03:00' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: 'PATCH' });
  });

  it('falha diferente de 409 → lança', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    const { upsertEvento } = await import('./google-calendar');

    await expect(
      upsertEvento({
        accessToken: 'tok',
        calendarioId: 'primary',
        evento: { id: 'esc123', titulo: 'Plantão', inicioIso: '2026-09-19T19:00:00-03:00', fimIso: '2026-09-20T07:00:00-03:00' },
      }),
    ).rejects.toThrow();
  });
});
