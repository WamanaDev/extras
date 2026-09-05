/**
 * API-AUTH-001/002/003 — token parcial da etapa 1 do login do colaborador.
 *
 * Não há biblioteca de JWT nas dependências do projeto (`package.json`) —
 * para não introduzir uma dependência nova só para um token de 3 minutos,
 * curta duração e um único consumidor (as próprias rotas de `auth/`), o
 * token é um HS256 "mão na massa" com `node:crypto` (mesmo formato
 * `header.payload.assinatura` em base64url que um JWT real, só que assinado
 * e verificado aqui mesmo) sobre `SESSION_SECRET` (já validado por `src/env.ts`).
 *
 * "Uso único" (`API-AUTH-001`, "não serve para nada além da etapa 2"; teste
 * de aceitação #5 de `API-AUTH-001`) não é algo que um JWT stateless resolva
 * sozinho — por isso todo consumo passa por `MarcarTokenParcialUsado`
 * (padrão: Upstash Redis, já dependência do projeto via `SET NX EX`), que
 * marca o `jti` como usado atomicamente. A primeira chamada que marcar
 * `ok: true` "ganha" o token; qualquer chamada seguinte (replay) falha.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { env } from '@/env';

const TTL_SEGUNDOS = 180; // 3 minutos — API-AUTH-001

export interface PayloadTokenParcial {
  sub: string; // colaboradorId
  scope: 'pin-pendente';
  jti: string;
  iat: number;
  exp: number;
  precisaDefinirPin: boolean;
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function assinarDados(dados: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(dados).digest('base64url');
}

export interface TokenParcialEmitido {
  token: string;
  expiraEm: Date;
  jti: string;
}

/** Emite um novo token parcial para `colaboradorId`, escopo fixo `pin-pendente`. */
export function emitirTokenParcial(colaboradorId: string, precisaDefinirPin: boolean, agora: Date): TokenParcialEmitido {
  const iat = Math.floor(agora.getTime() / 1000);
  const exp = iat + TTL_SEGUNDOS;
  const jti = randomUUID();
  const payload: PayloadTokenParcial = { sub: colaboradorId, scope: 'pin-pendente', jti, iat, exp, precisaDefinirPin };

  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const dados = `${header}.${body}`;
  const assinatura = assinarDados(dados);

  return { token: `${dados}.${assinatura}`, expiraEm: new Date(exp * 1000), jti };
}

export type MotivoTokenParcialInvalido = 'MAL_FORMADO' | 'ASSINATURA_INVALIDA' | 'ESCOPO_INVALIDO' | 'EXPIRADO' | 'JA_USADO';

export type ResultadoTokenParcial =
  | { ok: true; payload: PayloadTokenParcial }
  | { ok: false; motivo: MotivoTokenParcialInvalido };

/** Só a verificação de forma/assinatura/expiração — não consome (não marca uso único). */
export function verificarTokenParcial(token: string, agora: Date): ResultadoTokenParcial {
  const partes = token.split('.');
  if (partes.length !== 3) return { ok: false, motivo: 'MAL_FORMADO' };
  const [header, body, assinatura] = partes as [string, string, string];

  const esperada = assinarDados(`${header}.${body}`);
  const bufRecebido = Buffer.from(assinatura);
  const bufEsperado = Buffer.from(esperada);
  if (bufRecebido.length !== bufEsperado.length || !timingSafeEqual(bufRecebido, bufEsperado)) {
    return { ok: false, motivo: 'ASSINATURA_INVALIDA' };
  }

  let payload: PayloadTokenParcial;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PayloadTokenParcial;
  } catch {
    return { ok: false, motivo: 'MAL_FORMADO' };
  }

  if (payload.scope !== 'pin-pendente' || typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
    return { ok: false, motivo: 'ESCOPO_INVALIDO' };
  }
  if (Math.floor(agora.getTime() / 1000) >= payload.exp) {
    return { ok: false, motivo: 'EXPIRADO' };
  }

  return { ok: true, payload };
}

/** Marca `jti` como usado. Devolve `true` na primeira vez (uso legítimo), `false` em replay. */
export type MarcarTokenParcialUsado = (jti: string, ttlSegundosRestante: number) => Promise<boolean>;

let redisSingleton: Redis | null = null;
function redisPadrao(): Redis {
  redisSingleton ??= new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  return redisSingleton;
}

/**
 * Implementação padrão via Redis. Falha fechada (mesmo espírito de
 * `login_matricula`/`login_ip` em `rate-limit.ts`): se o Redis estiver
 * indisponível, trata como "já usado" — preferir recusar um login legítimo a
 * permitir replay do token parcial.
 */
export const marcarTokenParcialUsadoPadrao: MarcarTokenParcialUsado = async (jti, ttlSegundosRestante) => {
  try {
    const resultado = await redisPadrao().set(`token-parcial:usado:${jti}`, '1', {
      nx: true,
      ex: Math.max(1, ttlSegundosRestante),
    });
    return resultado === 'OK';
  } catch {
    return false;
  }
};

/**
 * Verifica e consome (uso único) um token parcial. Único ponto que as rotas
 * de etapa 2 (`pin`, `definir-pin`) devem chamar.
 */
export async function consumirTokenParcial(
  token: string,
  agora: Date,
  marcarUsado: MarcarTokenParcialUsado = marcarTokenParcialUsadoPadrao,
): Promise<ResultadoTokenParcial> {
  const verificacao = verificarTokenParcial(token, agora);
  if (!verificacao.ok) return verificacao;

  const ttlRestante = verificacao.payload.exp - Math.floor(agora.getTime() / 1000);
  const podeUsar = await marcarUsado(verificacao.payload.jti, ttlRestante);
  if (!podeUsar) return { ok: false, motivo: 'JA_USADO' };

  return verificacao;
}
