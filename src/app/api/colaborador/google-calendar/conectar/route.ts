/**
 * `GET /api/colaborador/google-calendar/conectar` — inicia o fluxo OAuth do
 * Google (pedido do usuário: sincronizar escala/extras na agenda pessoal).
 *
 * Foge do pipeline de `defineHandler` de propósito, mesmo motivo do cron
 * (`/api/cron/lembrete-extra/route.ts`): a resposta é um REDIRECT (302),
 * nunca um envelope JSON — o contrato comum não modela isso. Ainda exige
 * sessão de colaborador (`resolverSessaoPadrao`, a mesma função que
 * `defineHandler` usa por baixo).
 */
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { resolverSessaoPadrao } from '@/server/http/handler';
import { construirUrlAutorizacao, googleCalendarConfigurado } from '@/server/integracoes/google-calendar';

/** `state` fica num cookie de vida curta — comparado de volta no callback (anti-CSRF do fluxo OAuth, RFC 6749 §10.12). */
const COOKIE_STATE = 'google_oauth_state';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!googleCalendarConfigurado()) {
    return NextResponse.json(
      { erro: 'INTEGRACAO_DESABILITADA', mensagem: 'Integração com Google Calendar não está configurada.', detalhes: null, requestId: '' },
      { status: 501 },
    );
  }

  const sessao = await resolverSessaoPadrao(request, '', 'COLABORADOR');
  if (!sessao || sessao.tipo !== 'COLABORADOR') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const state = randomBytes(16).toString('hex');
  const redirectUri = `${request.nextUrl.origin}/api/colaborador/google-calendar/callback`;
  const urlAutorizacao = construirUrlAutorizacao({ redirectUri, state });

  const response = NextResponse.redirect(urlAutorizacao);
  response.cookies.set(COOKIE_STATE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10min — tempo de sobra pro colaborador completar o consentimento no Google.
  });
  return response;
}
