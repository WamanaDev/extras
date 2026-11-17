/**
 * `ArmazemCodigo` sobre o Upstash Redis que o projeto já usa para rate limit
 * (`src/server/http/rate-limit.ts`). Código de login é efêmero (TTL de 10
 * min) — não justifica tabela nem migration.
 */
import { Redis } from '@upstash/redis';
import { env } from '@/env';
import type { ArmazemCodigo, RegistroCodigo } from './codigo-whatsapp';

let redisSingleton: Redis | null = null;
function redis(): Redis {
  redisSingleton ??= new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  return redisSingleton;
}

const chave = (userId: string): string => `admin_2fa:codigo:${userId}`;

export const armazemCodigoRedis: ArmazemCodigo = {
  async salvar(userId, registro, ttlSegundos) {
    await redis().set(chave(userId), registro, { ex: ttlSegundos });
  },
  async obter(userId) {
    return (await redis().get<RegistroCodigo>(chave(userId))) ?? null;
  },
  async atualizar(userId, registro) {
    await redis().set(chave(userId), registro, { keepTtl: true });
  },
  async apagar(userId) {
    await redis().del(chave(userId));
  },
};
