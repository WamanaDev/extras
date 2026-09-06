/**
 * Integração com o Google Calendar (OAuth2 + Calendar API v3) — pedido do
 * usuário: botão pro colaborador conectar a agenda pessoal e sincronizar
 * escala + extras confirmadas. Sem dependência nova (`googleapis` é um SDK
 * pesado pra só 3 chamadas HTTP) — `fetch` direto contra os endpoints REST
 * do Google, mesmo espírito de `push.ts` (infra mínima, sem SDK a mais).
 *
 * Fluxo (RFC 6749, "Authorization Code"):
 * 1. `construirUrlAutorizacao` — redireciona o colaborador pro consentimento
 *    do Google (`/api/colaborador/google-calendar/conectar`).
 * 2. Google redireciona de volta com `?code=` — `trocarCodigoPorTokens`
 *    troca por `access_token`/`refresh_token`
 *    (`/api/colaborador/google-calendar/callback`).
 * 3. Só o `refresh_token` é persistido (cifrado — nunca em claro, ver
 *    `criptografar`/`descriptografar`); o `access_token` é de curta duração
 *    (~1h) e é pedido de novo a cada sincronização via `obterAccessToken`.
 *
 * `access_type=offline&prompt=consent` sempre juntos na URL de autorização:
 * sem os dois, o Google só devolve `refresh_token` na PRIMEIRA autorização
 * de cada usuário — reconectar depois de revogar o acesso não devolveria um
 * novo, e a app ficaria com um token morto sem saber.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@/env';

const ESCOPO_CALENDAR = 'https://www.googleapis.com/auth/calendar.events';
const URL_AUTORIZACAO = 'https://accounts.google.com/o/oauth2/v2/auth';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const URL_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/** A integração está configurada (as 3 variáveis de `src/env.ts` existem)? Botão/rotas ficam desabilitados sem isso — nunca quebra o boot. */
export function googleCalendarConfigurado(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.CALENDAR_TOKEN_KEY);
}

function chaveCifra(): Buffer {
  if (!env.CALENDAR_TOKEN_KEY) throw new Error('CALENDAR_TOKEN_KEY não configurada.');
  return Buffer.from(env.CALENDAR_TOKEN_KEY, 'hex');
}

/**
 * AES-256-GCM — formato `iv:tag:cifrado` (hex, `:` como separador — nenhuma
 * das três partes contém `:`). Precisa ser reversível (diferente de hash de
 * PIN/senha): a app usa o refresh token de verdade pra chamar a API do
 * Google, não só confirma que ele "bate".
 */
export function criptografar(textoPlano: string): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv('aes-256-gcm', chaveCifra(), iv);
  const cifrado = Buffer.concat([cifra.update(textoPlano, 'utf8'), cifra.final()]);
  return `${iv.toString('hex')}:${cifra.getAuthTag().toString('hex')}:${cifrado.toString('hex')}`;
}

export function descriptografar(textoCifrado: string): string {
  const [ivHex, tagHex, cifradoHex] = textoCifrado.split(':');
  if (!ivHex || !tagHex || !cifradoHex) throw new Error('Formato de token cifrado inválido.');
  const decifra = createDecipheriv('aes-256-gcm', chaveCifra(), Buffer.from(ivHex, 'hex'));
  decifra.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decifra.update(Buffer.from(cifradoHex, 'hex')), decifra.final()]).toString('utf8');
}

export function construirUrlAutorizacao(params: { redirectUri: string; state: string }): string {
  const query = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: ESCOPO_CALENDAR,
    access_type: 'offline',
    prompt: 'consent',
    state: params.state,
  });
  return `${URL_AUTORIZACAO}?${query.toString()}`;
}

interface RespostaToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

export interface TokensObtidos {
  accessToken: string;
  refreshToken: string;
}

/** Troca o `code` do redirect do Google por tokens. Lança se o Google recusar ou não devolver `refresh_token` (ver docstring do módulo — `prompt=consent` deveria garantir). */
export async function trocarCodigoPorTokens(params: { code: string; redirectUri: string }): Promise<TokensObtidos> {
  const resposta = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      code: params.code,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const corpo = (await resposta.json()) as RespostaToken;
  if (!resposta.ok || !corpo.refresh_token) {
    throw new Error(`Falha ao trocar código por tokens: ${corpo.error ?? resposta.status} ${corpo.error_description ?? ''}`.trim());
  }
  return { accessToken: corpo.access_token, refreshToken: corpo.refresh_token };
}

/** Pede um `access_token` novo a partir do `refresh_token` cifrado guardado no banco. */
export async function obterAccessToken(refreshTokenCifrado: string): Promise<string> {
  const refreshToken = descriptografar(refreshTokenCifrado);
  const resposta = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const corpo = (await resposta.json()) as RespostaToken;
  if (!resposta.ok) {
    throw new Error(`Falha ao renovar access token: ${corpo.error ?? resposta.status} ${corpo.error_description ?? ''}`.trim());
  }
  return corpo.access_token;
}

export interface EventoCalendario {
  id: string;
  titulo: string;
  descricao?: string;
  /** ISO 8601 com offset — `2026-09-19T19:00:00-03:00`. */
  inicioIso: string;
  fimIso: string;
}

/**
 * Cria ou atualiza um evento com id fixo (idempotente — sincronizar de novo
 * não duplica). Google não tem "upsert" nativo: tenta criar (`POST`); se já
 * existir (`409`), atualiza (`PATCH`) no lugar.
 */
export async function upsertEvento(params: { accessToken: string; calendarioId: string; evento: EventoCalendario }): Promise<void> {
  const { accessToken, calendarioId, evento } = params;
  const corpo = {
    id: evento.id,
    summary: evento.titulo,
    description: evento.descricao,
    start: { dateTime: evento.inicioIso },
    end: { dateTime: evento.fimIso },
  };

  const respostaCriar = await fetch(`${URL_CALENDAR_API}/calendars/${encodeURIComponent(calendarioId)}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (respostaCriar.ok) return;
  if (respostaCriar.status !== 409) {
    throw new Error(`Falha ao criar evento no Google Calendar: ${respostaCriar.status}`);
  }

  const respostaAtualizar = await fetch(
    `${URL_CALENDAR_API}/calendars/${encodeURIComponent(calendarioId)}/events/${encodeURIComponent(evento.id)}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    },
  );
  if (!respostaAtualizar.ok) {
    throw new Error(`Falha ao atualizar evento no Google Calendar: ${respostaAtualizar.status}`);
  }
}

/**
 * Id de evento determinístico a partir de uma linha do banco — Google exige
 * `^[a-v0-9]{5,1024}$` (base32hex minúsculo); um UUID sem hífens já usa só
 * `0-9a-f`, subconjunto válido de `0-9a-v`, então basta remover os hífens.
 */
export function idEventoEscala(escalaDiaId: string): string {
  return `esc${escalaDiaId.replace(/-/g, '')}`;
}

export function idEventoExtra(marcacaoId: string): string {
  // Prefixo não pode ter "x" — fora do alfabeto exigido pelo Google (`a-v0-9`).
  return `etr${marcacaoId.replace(/-/g, '')}`;
}
