/**
 * Segundo fator do admin por WhatsApp — peças puras (sem I/O), testáveis.
 *
 * Substitui o MFA TOTP do Supabase (pedido do usuário: app autenticador era
 * atrito demais para a equipe). Fluxo completo:
 * 1. `POST /api/auth/admin/login` confere a senha no Supabase Auth (sessão
 *    `aal1` gravada em cookie) e manda um código de 6 dígitos pro WhatsApp
 *    cadastrado em `app_metadata.whatsapp` (via Evolution API).
 * 2. `POST /api/auth/admin/codigo/verificar` confere o código e grava o
 *    cookie `admin_2fa` — assinado (HMAC com `SESSION_SECRET`) e preso ao
 *    `session_id` daquela sessão do Supabase.
 * 3. Os guardas de admin (`resolverSessaoAdmin` em `handler.ts` e
 *    `obterEstadoSessaoAdmin` em `sessao-admin.ts`) só aceitam a sessão do
 *    Supabase **com** um `admin_2fa` válido para o mesmo usuário e sessão.
 *
 * Por que `app_metadata` e não `user_metadata`: `user_metadata` é editável
 * pelo próprio usuário (`supabase.auth.updateUser({ data })`) com a sessão
 * `aal1` — quem tivesse só a senha trocaria o número pro dele e receberia o
 * código. `app_metadata` só a service role escreve.
 *
 * Por que preso ao `session_id`: logout + novo login gera outra sessão no
 * Supabase, então um `admin_2fa` antigo que tenha ficado no navegador não
 * vale para ela — todo login novo pede código novo.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const NOME_COOKIE_SEGUNDO_FATOR = 'admin_2fa';
/** Quanto tempo uma sessão verificada dura antes de pedir código de novo. */
export const DURACAO_SEGUNDO_FATOR_SEGUNDOS = 4 * 60 * 60; // `API-AUTH-006`, CIA "I": sessão admin de 4h
export const VALIDADE_CODIGO_SEGUNDOS = 10 * 60;
export const MAX_TENTATIVAS_CODIGO = 5;

// ----------------------------------------------------------------------------
// Número de WhatsApp
// ----------------------------------------------------------------------------

/**
 * Normaliza para só dígitos com DDI (formato que a Evolution API espera,
 * ex. `5511987654321`). Número brasileiro sem DDI (10–11 dígitos, DDD +
 * número) ganha `55` na frente. Devolve `null` se não parecer um número.
 */
export function normalizarWhatsapp(entrada: string): string | null {
  const digitos = entrada.replace(/\D/g, '');
  const comDdi = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  if (comDdi.length < 12 || comDdi.length > 15) return null;
  return comDdi;
}

/** Só os 4 últimos dígitos — o suficiente pro admin reconhecer o próprio número sem expor o resto. */
export function mascararWhatsapp(numero: string): string {
  return `•••• ${numero.slice(-4)}`;
}

/** Lê `app_metadata.whatsapp` de um usuário do Supabase, validando o formato. */
export function whatsappDoAppMetadata(appMetadata: unknown): string | null {
  if (typeof appMetadata !== 'object' || appMetadata === null) return null;
  const valor = (appMetadata as Record<string, unknown>).whatsapp;
  return typeof valor === 'string' ? normalizarWhatsapp(valor) : null;
}

// ----------------------------------------------------------------------------
// Código
// ----------------------------------------------------------------------------

export function gerarCodigo(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Hash do código — nunca guardamos o código em claro no Redis. Inclui o usuário para o mesmo código não ter o mesmo hash entre contas. */
export function hashCodigo(segredo: string, userId: string, codigo: string): string {
  return createHmac('sha256', segredo).update(`codigo:${userId}:${codigo}`).digest('hex');
}

export function compararSeguro(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// ----------------------------------------------------------------------------
// Cookie `admin_2fa`
// ----------------------------------------------------------------------------

function assinatura(segredo: string, userId: string, sessionId: string, expiraEmSegundos: number): string {
  return createHmac('sha256', segredo).update(`admin_2fa:${userId}:${sessionId}:${expiraEmSegundos}`).digest('base64url');
}

/** Valor do cookie: `<sessionId>.<expiraEm em segundos epoch>.<hmac>`. O `userId` entra na assinatura mas não no valor. */
export function assinarCookieSegundoFator(segredo: string, userId: string, sessionId: string, agora: Date): string {
  const expiraEm = Math.floor(agora.getTime() / 1000) + DURACAO_SEGUNDO_FATOR_SEGUNDOS;
  return `${sessionId}.${expiraEm}.${assinatura(segredo, userId, sessionId, expiraEm)}`;
}

export function cookieSegundoFatorValido(
  segredo: string,
  valor: string | undefined,
  userId: string,
  sessionId: string,
  agora: Date,
): boolean {
  if (!valor) return false;
  const partes = valor.split('.');
  if (partes.length !== 3) return false;
  const [sessionIdCookie, expiraEmTexto, assinaturaCookie] = partes as [string, string, string];
  if (sessionIdCookie !== sessionId) return false;
  const expiraEm = Number(expiraEmTexto);
  if (!Number.isInteger(expiraEm) || expiraEm * 1000 <= agora.getTime()) return false;
  return compararSeguro(assinaturaCookie, assinatura(segredo, userId, sessionId, expiraEm));
}

// ----------------------------------------------------------------------------
// Sessão do Supabase
// ----------------------------------------------------------------------------

/**
 * `session_id` do access token do Supabase (claim padrão do GoTrue). Só
 * decodifica — quem chama já validou o token com `auth.getUser()`, que
 * confere a assinatura no servidor do Supabase.
 */
export function sessionIdDoAccessToken(accessToken: string): string | null {
  const payload = accessToken.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    return typeof claims.session_id === 'string' ? claims.session_id : null;
  } catch {
    return null;
  }
}
