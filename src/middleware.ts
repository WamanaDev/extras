/**
 * SEC-CONF — aplica os headers de segurança obrigatórios a toda resposta.
 * Ver `src/server/http/security-headers.ts` para o conteúdo de cada header.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { aplicarHeadersSeguranca, gerarNonceCsp } from '@/server/http/security-headers';

export function middleware(request: NextRequest): NextResponse {
  const nonce = gerarNonceCsp();
  // `request.headers` sobrescreve TODO o conjunto de headers repassado
  // adiante — passar só `{ 'x-csp-nonce': nonce }` (como antes) descartava
  // `X-Requested-With`, cookies e qualquer outro header do request original,
  // quebrando CSRF (`CSRF_INVALIDO` em toda mutação) e a leitura de sessão em
  // produção real. Clona os headers recebidos e só adiciona o nonce.
  const headers = new Headers(request.headers);
  headers.set('x-csp-nonce', nonce);
  const response = NextResponse.next({ request: { headers } });
  aplicarHeadersSeguranca(response.headers, nonce, process.env.NODE_ENV !== 'production');
  return response;
}

export const config = {
  // Todas as rotas exceto assets estáticos do Next.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
