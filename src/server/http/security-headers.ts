/**
 * SEC-CONF — Transporte e sessão: headers de segurança e opções de cookie.
 *
 * Aplicados a toda resposta (via `src/middleware.ts`). Teste de aceitação C8
 * exige que todos estejam presentes em produção.
 */
/**
 * Gera um nonce por request para a CSP (`unsafe-inline` proibido).
 *
 * Usa Web Crypto (`crypto.getRandomValues`) em vez de `node:crypto`: este
 * módulo é importado por `src/middleware.ts`, que o Next.js empacota para o
 * runtime Edge por padrão — `node:crypto` quebra esse build. Web Crypto é
 * global em Edge, Node 19+ e browser, sem trade-off de segurança.
 */
export function gerarNonceCsp(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

/**
 * `unsafe-eval`/`unsafe-inline` só em dev: o HMR do Next (`react-refresh`,
 * `eval()` do webpack para source maps, `<style>` injetado sem nonce pelo
 * dev server) não funciona sob a CSP estrita de produção — travava o app
 * inteiro em `next dev` (EvalError no console, CSS não aplicado). Teste C8
 * (`security-headers.test.ts`) cobre só a política de produção, que continua
 * sem `unsafe-eval`/`unsafe-inline`.
 *
 * `'strict-dynamic'` em `script-src` é obrigatório junto do nonce — receita
 * oficial do Next.js pra CSP com nonce em App Router
 * (nextjs.org/docs/app/building-your-application/configuring/content-security-policy).
 * Sem ele, só o script raiz que carrega com o nonce é confiável; os demais
 * `<script>` que o PRÓPRIO Next injeta em runtime (payload de hidratação por
 * Suspense boundary, streaming de Server Components — cada um com hash
 * SHA-256 diferente, gerado pelo conteúdo, não algo que dá pra colocar nonce
 * neles individualmente) ficam bloqueados mesmo com o restante da CSP
 * correto. `'strict-dynamic'` propaga a confiança do script com nonce pros
 * scripts que ELE injeta dinamicamente — é assim que o navegador aceita os
 * scripts internos do framework sem listar um hash por script (que muda a
 * cada build). Navegadores que não suportam `strict-dynamic` (CSP Level 2)
 * ignoram a palavra-chave e caem em `'self'`/nonce normalmente — por isso
 * `'self'` continua listado, como fallback. Achado em uso real
 * (`_conflitos.md`): sem isso, login em produção ficava com "Executing
 * inline script violates..." pra cada script interno do Next, mesmo com o
 * nonce presente e correto tanto na resposta quanto na requisição.
 */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/**
 * Aplica os headers de segurança obrigatórios a `headers`, mutando-o.
 * `nonce` deve ser gerado uma vez por request e reutilizado nos `<script>`.
 * `dev` relaxa só a CSP (ver `contentSecurityPolicy`) — todo o resto é igual
 * em qualquer ambiente.
 */
export function aplicarHeadersSeguranca(headers: Headers, nonce: string, dev = false): Headers {
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  headers.set('Content-Security-Policy', contentSecurityPolicy(nonce, dev));
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  return headers;
}

/** Lista de headers exigida pelo teste C8 — usada tanto pela suíte quanto por checagens externas. */
export const HEADERS_SEGURANCA_OBRIGATORIOS = [
  'Strict-Transport-Security',
  'Content-Security-Policy',
  'Referrer-Policy',
  'X-Content-Type-Options',
  'X-Frame-Options',
] as const;

/**
 * Opções de cookie de sessão (`SEC-CONF` — Transporte e sessão).
 * `secure` é condicional a produção só para permitir `http://localhost` em dev;
 * em produção é sempre `true` — nunca configurável por env.
 */
export function opcoesCookieSessao(producao: boolean): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: producao,
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60, // sessão de 8h (S3)
  };
}
