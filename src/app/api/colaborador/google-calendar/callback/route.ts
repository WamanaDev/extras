/**
 * `GET /api/colaborador/google-calendar/callback` — volta do consentimento
 * do Google com `?code=`/`?state=` (ou `?error=` se a pessoa recusar).
 *
 * Mesmo motivo de `conectar/route.ts` pra fugir de `defineHandler`: resposta
 * é sempre um redirect de volta pra `/minha-escala`, nunca JSON.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { resolverSessaoPadrao } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { redigirParaLog } from '@/server/log/redact';
import { criptografar, trocarCodigoPorTokens } from '@/server/integracoes/google-calendar';

const COOKIE_STATE = 'google_oauth_state';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const destino = new URL('/minha-escala', request.url);

  const sessao = await resolverSessaoPadrao(request, '', 'COLABORADOR');
  if (!sessao || sessao.tipo !== 'COLABORADOR') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (request.nextUrl.searchParams.get('error')) {
    // Colaborador clicou em "Cancelar" na tela de consentimento do Google — não é erro nosso.
    destino.searchParams.set('googleCalendar', 'recusado');
    return NextResponse.redirect(destino);
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const stateCookie = request.cookies.get(COOKIE_STATE)?.value;

  const response = (resultado: 'conectado' | 'erro'): NextResponse => {
    destino.searchParams.set('googleCalendar', resultado);
    const resposta = NextResponse.redirect(destino);
    resposta.cookies.delete(COOKIE_STATE);
    return resposta;
  };

  if (!code || !state || !stateCookie || state !== stateCookie) {
    return response('erro');
  }

  try {
    const redirectUri = `${request.nextUrl.origin}/api/colaborador/google-calendar/callback`;
    const tokens = await trocarCodigoPorTokens({ code, redirectUri });
    const prisma = await obterPrisma();
    const refreshTokenCifrado = criptografar(tokens.refreshToken);
    await prisma.googleCalendarConta.upsert({
      where: { colaboradorId: sessao.colaboradorId },
      create: { colaboradorId: sessao.colaboradorId, refreshTokenCifrado },
      update: { refreshTokenCifrado },
    });
    return response('conectado');
  } catch (erro) {
    // eslint-disable-next-line no-console
    console.error(redigirParaLog({ msg: 'falha ao conectar Google Calendar', colaboradorId: sessao.colaboradorId, erro: String(erro) }));
    return response('erro');
  }
}
