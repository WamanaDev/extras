/**
 * `GET /api/cron/lembrete-extra` — foge do pipeline de `defineHandler`
 * (webhook interno, autenticado por segredo compartilhado, não sessão — ver
 * doc-comment de `route.ts`). Cobre a checagem de `CRON_SECRET`, validação
 * de `turno` e que `enviarLembretesDeExtra` é chamado com os parâmetros certos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const enviarLembretesMock = vi.fn();
vi.mock('@/server/notificacoes/lembrete-extra', () => ({
  enviarLembretesDeExtra: (...args: unknown[]) => enviarLembretesMock(...args),
}));

vi.mock('@/server/db/client', () => ({
  obterPrisma: async () => ({}),
}));

function req(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), { headers });
}

let GET: typeof import('./route').GET;

beforeEach(async () => {
  vi.resetModules();
  process.env.CRON_SECRET = 'segredo-de-teste';
  enviarLembretesMock.mockReset();
  enviarLembretesMock.mockResolvedValue({ turno: 'NOTURNO', dataAlvo: '2026-09-08', notificadas: 1, jaNotificadas: 0 });
  GET = (await import('./route')).GET;
});

describe('GET /api/cron/lembrete-extra', () => {
  it('sem header Authorization → 401, nunca chama enviarLembretesDeExtra', async () => {
    const response = await GET(req('http://localhost/api/cron/lembrete-extra?turno=NOTURNO'));
    expect(response.status).toBe(401);
    expect(enviarLembretesMock).not.toHaveBeenCalled();
  });

  it('Authorization com segredo errado → 401', async () => {
    const response = await GET(req('http://localhost/api/cron/lembrete-extra?turno=NOTURNO', { authorization: 'Bearer errado' }));
    expect(response.status).toBe(401);
  });

  it('CRON_SECRET não configurada no ambiente → 401 mesmo sem tentar adivinhar', async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(req('http://localhost/api/cron/lembrete-extra?turno=NOTURNO', { authorization: 'Bearer undefined' }));
    expect(response.status).toBe(401);
  });

  it('segredo certo mas turno inválido/ausente → 422, nunca chama enviarLembretesDeExtra', async () => {
    const response = await GET(req('http://localhost/api/cron/lembrete-extra?turno=MADRUGADA', { authorization: 'Bearer segredo-de-teste' }));
    expect(response.status).toBe(422);
    expect(enviarLembretesMock).not.toHaveBeenCalled();
  });

  it('segredo certo e turno válido → 200, repassa o turno pra enviarLembretesDeExtra', async () => {
    const response = await GET(req('http://localhost/api/cron/lembrete-extra?turno=NOTURNO', { authorization: 'Bearer segredo-de-teste' }));
    expect(response.status).toBe(200);
    expect(enviarLembretesMock).toHaveBeenCalledWith(expect.anything(), 'NOTURNO', expect.any(Date));
    expect(await response.json()).toEqual({ turno: 'NOTURNO', dataAlvo: '2026-09-08', notificadas: 1, jaNotificadas: 0 });
  });

  it('falha interna → 500 ERRO_INTERNO, nunca vaza o erro bruto', async () => {
    enviarLembretesMock.mockRejectedValue(new Error('detalhe técnico sensível'));
    const response = await GET(req('http://localhost/api/cron/lembrete-extra?turno=DIURNO', { authorization: 'Bearer segredo-de-teste' }));
    expect(response.status).toBe(500);
    const corpo = await response.json();
    expect(corpo.mensagem).not.toContain('detalhe técnico sensível');
  });
});
