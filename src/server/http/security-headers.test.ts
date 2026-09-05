import { describe, expect, it } from 'vitest';
import {
  HEADERS_SEGURANCA_OBRIGATORIOS,
  aplicarHeadersSeguranca,
  gerarNonceCsp,
  opcoesCookieSessao,
} from './security-headers';

describe('security-headers (SEC-CONF, teste C8)', () => {
  it('aplica todos os headers obrigatórios', () => {
    const headers = new Headers();
    const nonce = gerarNonceCsp();
    aplicarHeadersSeguranca(headers, nonce);
    for (const nome of HEADERS_SEGURANCA_OBRIGATORIOS) {
      expect(headers.get(nome)).toBeTruthy();
    }
  });

  it('HSTS com max-age >= 2 anos, includeSubDomains e preload', () => {
    const headers = new Headers();
    aplicarHeadersSeguranca(headers, gerarNonceCsp());
    const hsts = headers.get('Strict-Transport-Security') ?? '';
    expect(hsts).toContain('max-age=63072000');
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
  });

  it('CSP não contém unsafe-inline e carrega o nonce do request', () => {
    const headers = new Headers();
    aplicarHeadersSeguranca(headers, 'nonce-de-teste');
    const csp = headers.get('Content-Security-Policy') ?? '';
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("'nonce-nonce-de-teste'");
  });

  it("script-src tem 'strict-dynamic' junto do nonce — sem isso os scripts que o próprio Next injeta em runtime (hash por conteúdo, não nonce) ficam bloqueados (achado em uso real)", () => {
    const headers = new Headers();
    aplicarHeadersSeguranca(headers, 'nonce-de-teste', false);
    const csp = headers.get('Content-Security-Policy') ?? '';
    expect(csp).toMatch(/script-src[^;]*'strict-dynamic'/);
    // 'self' continua listado como fallback pra navegador CSP Level 2 (não suporta strict-dynamic).
    expect(csp).toMatch(/script-src 'self'/);
  });

  it('em dev, CSP libera unsafe-eval/unsafe-inline (HMR do Next); em produção continua sem eles', () => {
    const headersDev = new Headers();
    aplicarHeadersSeguranca(headersDev, 'nonce-de-teste', true);
    const cspDev = headersDev.get('Content-Security-Policy') ?? '';
    expect(cspDev).toContain('unsafe-eval');
    expect(cspDev).toContain('unsafe-inline');

    const headersProd = new Headers();
    aplicarHeadersSeguranca(headersProd, 'nonce-de-teste', false);
    const cspProd = headersProd.get('Content-Security-Policy') ?? '';
    expect(cspProd).not.toContain('unsafe-eval');
    expect(cspProd).not.toContain('unsafe-inline');
  });

  it('X-Frame-Options DENY e X-Content-Type-Options nosniff', () => {
    const headers = new Headers();
    aplicarHeadersSeguranca(headers, gerarNonceCsp());
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('gerarNonceCsp produz valores distintos a cada chamada', () => {
    const a = gerarNonceCsp();
    const b = gerarNonceCsp();
    expect(a).not.toBe(b);
  });

  it('opcoesCookieSessao: httpOnly + SameSite=Lax sempre; secure só em produção', () => {
    const dev = opcoesCookieSessao(false);
    const prod = opcoesCookieSessao(true);
    expect(dev.httpOnly).toBe(true);
    expect(dev.sameSite).toBe('lax');
    expect(dev.secure).toBe(false);
    expect(prod.secure).toBe(true);
    expect(prod.maxAge).toBe(8 * 60 * 60);
  });
});
