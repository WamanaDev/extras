/**
 * SEC-CONF — Credenciais: hashing de PIN e token de sessão.
 *
 * - PIN nunca é persistido em claro. Hash `argon2id` com pepper de ambiente
 *   (`PIN_PEPPER`), parâmetros OWASP 2024: `memoryCost=19456 KiB, timeCost=2,
 *   parallelism=1`.
 * - O pepper viaja como `secret` do argon2 (parâmetro *associated data* do
 *   algoritmo, RFC 9106) — não é concatenado à senha. Fica fora do banco: um
 *   dump sozinho não permite ataque de dicionário offline.
 * - Token de sessão: 32 bytes aleatórios entregues ao cliente; só o SHA-256
 *   dele vai ao banco (`sessao_colaborador.token_hash`).
 * - `compararComHashDummy` existe para a defesa de enumeração por timing
 *   (S4/C5): a rota de login roda uma verificação de hash mesmo quando o
 *   colaborador não existe, contra um hash fixo, para que "matrícula
 *   inexistente" e "PIN errado" levem o mesmo tempo.
 */
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '@/env';

const PARAMETROS_ARGON2ID = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash fixo e válido de uma string arbitrária, usado como alvo de comparação
 * quando o colaborador não existe. Gerado uma única vez por processo com o
 * pepper de PIN — não precisa (nem deve) corresponder a nenhuma credencial
 * real. O importante é que `argon2.verify` percorra o mesmo custo computacional
 * que uma verificação real percorreria.
 */
let hashDummyCache: Promise<string> | null = null;
function hashDummy(): Promise<string> {
  if (!hashDummyCache) {
    hashDummyCache = argon2.hash('valor-dummy-para-tempo-constante', {
      ...PARAMETROS_ARGON2ID,
      secret: Buffer.from(env.PIN_PEPPER, 'utf8'),
    });
  }
  return hashDummyCache;
}

/** Hash de PIN (4–6 dígitos) com `PIN_PEPPER`. */
export async function hashPin(pin: string): Promise<string> {
  return argon2.hash(pin, { ...PARAMETROS_ARGON2ID, secret: Buffer.from(env.PIN_PEPPER, 'utf8') });
}

/** Verifica PIN contra hash existente. Nunca lança em PIN incorreto — devolve `false`. */
export async function verificarPin(pin: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, pin, { secret: Buffer.from(env.PIN_PEPPER, 'utf8') });
  } catch {
    return false;
  }
}

/**
 * Roda uma verificação de argon2id contra um hash dummy fixo — mesmo custo
 * computacional de uma verificação real, sem revelar (por tempo) se a
 * matrícula existe. Chamar sempre que a matrícula não for encontrada, antes
 * de responder `CREDENCIAIS_INVALIDAS` (S4 / C5).
 */
export async function compararComHashDummy(): Promise<void> {
  const hash = await hashDummy();
  await argon2.verify(hash, 'valor-arbitrario', { secret: Buffer.from(env.PIN_PEPPER, 'utf8') }).catch(() => false);
}

export interface TokenSessao {
  /** Vai para o cookie do cliente. Nunca persistido em claro. */
  token: string;
  /** SHA-256 do token, em hex — é isso que vai ao banco. */
  tokenHash: string;
}

/** Gera um novo token de sessão: 32 bytes aleatórios + seu SHA-256. */
export function gerarTokenSessao(): TokenSessao {
  const bytes = randomBytes(32);
  const token = bytes.toString('base64url');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  return { token, tokenHash };
}

/** Recalcula o SHA-256 de um token recebido do cliente, para comparar com `token_hash` no banco. */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
