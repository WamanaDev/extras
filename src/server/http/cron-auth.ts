/**
 * Autenticação compartilhada das rotas `/api/cron/*` (webhook interno,
 * segredo compartilhado `CRON_SECRET` — fora do pipeline de `defineHandler`,
 * ver docstring de `lembrete-extra/route.ts`).
 *
 * Reforço pedido pelo usuário: o workflow do GitHub Actions que chama essas
 * rotas vive num repositório público — o `.yml` (URL do endpoint, horário)
 * fica visível pra qualquer um, só o valor de `CRON_SECRET` é mascarado pelo
 * GitHub nos logs. Duas defesas extras, então, contra alguém tentando
 * adivinhar o segredo ou abusar do endpoint:
 *
 * 1. **Rate limit por IP** (`cron_ip`, 20/min — `src/server/http/rate-limit.ts`),
 *    igual a qualquer rota sensível do app: trava tentativa de força bruta
 *    bem antes de qualquer chance real de acertar um segredo aleatório.
 * 2. **Comparação em tempo constante** (`timingSafeEqual`) em vez de `===`:
 *    evita que a diferença de tempo entre "primeiro caractere errado" e
 *    "segredo quase certo" vaze informação por timing (mesmo racional de
 *    `compararComHashDummy` em `src/server/auth/credenciais.ts`).
 */
import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { verificarRateLimit } from './rate-limit';
import { extrairIp } from './handler';

export type ResultadoAuthCron = { ok: true } | { ok: false; status: 401 | 429; mensagem: string; retryAfter?: number };

/** Compara dois textos em tempo constante — só usa `Buffer` de tamanho igual (senão já são diferentes). */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifica rate limit por IP e o segredo do cron, nessa ordem (rejeita por
 * limite antes de sequer olhar o header, então uma avalanche de tentativas
 * nunca chega a gastar a comparação de segredo por request).
 */
export async function autorizarCron(request: NextRequest): Promise<ResultadoAuthCron> {
  const ip = extrairIp(request.headers);
  const limite = await verificarRateLimit('cron_ip', ip);
  if (!limite.permitido) {
    return { ok: false, status: 429, mensagem: 'Muitas tentativas. Tente novamente em instantes.', retryAfter: limite.retryAfter };
  }

  const segredo = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  if (!segredo || !iguaisEmTempoConstante(header, `Bearer ${segredo}`)) {
    return { ok: false, status: 401, mensagem: 'Token de cron ausente ou inválido.' };
  }

  return { ok: true };
}
