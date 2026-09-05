/**
 * SEC-CONF — o Next.js só aplica `nonce="..."` sozinho aos próprios
 * `<script>` inline (hidratação, streaming de RSC) se o header
 * `Content-Security-Policy` também estiver presente nos headers da
 * REQUISIÇÃO repassada adiante (não só na resposta) — comportamento
 * documentado do framework, não uma regra deste projeto. Achado em uso
 * real: sem isso, login em produção quebrava com "Executing inline script
 * violates the following Content Security Policy directive" (`_conflitos.md`).
 */
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

function req(url = 'http://localhost:3000/login'): NextRequest {
  return new NextRequest(new URL(url), { headers: { 'x-requested-with': 'fetch' } });
}

describe('middleware — CSP com nonce chega tanto na resposta quanto na requisição repassada', () => {
  it('o header Content-Security-Policy da resposta e o repassado ao Next (request.headers) usam o MESMO nonce', () => {
    const response = middleware(req());

    const cspResposta = response.headers.get('Content-Security-Policy') ?? '';
    // O Next lê o CSP da requisição via `response.headers` internos que a própria
    // `NextResponse.next({ request: { headers } })` expõe em `request.headers`.
    const cspRequisicao = response.headers.get('x-middleware-request-content-security-policy') ?? '';

    expect(cspResposta).toContain("script-src 'self' 'nonce-");
    expect(cspRequisicao).toContain("script-src 'self' 'nonce-");

    const nonceResposta = /nonce-([^']+)'/.exec(cspResposta)?.[1];
    const nonceRequisicao = /nonce-([^']+)'/.exec(cspRequisicao)?.[1];
    expect(nonceResposta).toBeTruthy();
    expect(nonceResposta).toBe(nonceRequisicao);
  });

  it('não descarta headers do request original (CSRF continua chegando à rota)', () => {
    const response = middleware(req());
    expect(response.headers.get('x-middleware-request-x-requested-with')).toBe('fetch');
  });

  it('nonces são diferentes a cada requisição', () => {
    const nonceDe = (r: ReturnType<typeof middleware>) => /nonce-([^']+)'/.exec(r.headers.get('Content-Security-Policy') ?? '')?.[1];
    const a = nonceDe(middleware(req()));
    const b = nonceDe(middleware(req()));
    expect(a).not.toBe(b);
  });
});
