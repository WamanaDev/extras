/**
 * SEC-CONF — aplica os headers de segurança obrigatórios a toda resposta.
 * Ver `src/server/http/security-headers.ts` para o conteúdo de cada header.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { aplicarHeadersSeguranca, contentSecurityPolicy, gerarNonceCsp } from '@/server/http/security-headers';

export function middleware(request: NextRequest): NextResponse {
  const nonce = gerarNonceCsp();
  const dev = process.env.NODE_ENV !== 'production';
  // `request.headers` sobrescreve TODO o conjunto de headers repassado
  // adiante — passar só `{ 'x-csp-nonce': nonce }` (como antes) descartava
  // `X-Requested-With`, cookies e qualquer outro header do request original,
  // quebrando CSRF (`CSRF_INVALIDO` em toda mutação) e a leitura de sessão em
  // produção real. Clona os headers recebidos e só adiciona o nonce.
  const headers = new Headers(request.headers);
  headers.set('x-csp-nonce', nonce);
  // O Next.js só aplica `nonce="..."` sozinho aos próprios `<script>` inline
  // (payload de hidratação, streaming de RSC) se o header
  // `Content-Security-Policy` também estiver presente nos headers da
  // REQUISIÇÃO, não só na resposta — é assim que o framework descobre qual
  // nonce usar nos scripts que ele mesmo injeta (comportamento documentado,
  // não algo que decidimos aqui). Sem isso, os scripts do próprio Next saem
  // sem nonce e o navegador bloqueia por violar a CSP (achado em uso real —
  // login quebrado em produção com "Executing inline script violates...").
  headers.set('Content-Security-Policy', contentSecurityPolicy(nonce, dev));
  const response = NextResponse.next({ request: { headers } });
  aplicarHeadersSeguranca(response.headers, nonce, dev);
  return response;
}

export const config = {
  // Todas as rotas exceto assets estáticos do Next.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
