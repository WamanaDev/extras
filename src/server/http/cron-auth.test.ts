/**
 * Testes de `autorizarCron` — rate limit por IP + comparação em tempo
 * constante do segredo. `verificarRateLimit` mockado (não bate em Redis
 * real); o foco aqui é a lógica de autorização em si.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verificarRateLimitMock = vi.fn();
vi.mock('./rate-limit', () => ({
  verificarRateLimit: (...args: unknown[]) => verificarRateLimitMock(...args),
}));

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/cron/x', { headers: { 'x-forwarded-for': '203.0.113.9', ...headers } });
}

let autorizarCron: typeof import('./cron-auth').autorizarCron;

beforeEach(async () => {
  vi.resetModules();
  process.env.CRON_SECRET = 'segredo-de-teste';
  verificarRateLimitMock.mockReset();
  verificarRateLimitMock.mockResolvedValue({ permitido: true, limite: 20, restante: 19, retryAfter: 0 });
  autorizarCron = (await import('./cron-auth')).autorizarCron;
});

describe('autorizarCron', () => {
  it('sem header Authorization → 401', async () => {
    const resultado = await autorizarCron(req());
    expect(resultado).toEqual({ ok: false, status: 401, mensagem: 'Token de cron ausente ou inválido.' });
  });

  it('segredo errado → 401', async () => {
    const resultado = await autorizarCron(req({ authorization: 'Bearer errado' }));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.status).toBe(401);
  });

  it('segredo com tamanho diferente do correto → 401 (nunca chama timingSafeEqual com buffers desiguais)', async () => {
    const resultado = await autorizarCron(req({ authorization: 'Bearer x' }));
    expect(resultado.ok).toBe(false);
  });

  it('CRON_SECRET não configurada → 401 mesmo com header presente', async () => {
    delete process.env.CRON_SECRET;
    const resultado = await autorizarCron(req({ authorization: 'Bearer qualquer-coisa' }));
    expect(resultado.ok).toBe(false);
  });

  it('segredo correto e dentro do limite → ok', async () => {
    const resultado = await autorizarCron(req({ authorization: 'Bearer segredo-de-teste' }));
    expect(resultado).toEqual({ ok: true });
  });

  it('rate limit estourado → 429, nem chega a comparar o segredo', async () => {
    verificarRateLimitMock.mockResolvedValue({ permitido: false, limite: 20, restante: 0, retryAfter: 42 });
    const resultado = await autorizarCron(req({ authorization: 'Bearer segredo-de-teste' }));
    expect(resultado).toEqual({ ok: false, status: 429, mensagem: 'Muitas tentativas. Tente novamente em instantes.', retryAfter: 42 });
  });

  it('checa o rate limit pelo escopo cron_ip e o IP extraído de x-forwarded-for', async () => {
    await autorizarCron(req({ authorization: 'Bearer segredo-de-teste' }));
    expect(verificarRateLimitMock).toHaveBeenCalledWith('cron_ip', '203.0.113.9');
  });
});
