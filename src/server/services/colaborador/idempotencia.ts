/**
 * API-COL-004 — armazenamento de `Idempotency-Key` (`POST /api/marcacoes`).
 *
 * `contrato-comum.md`: "`Idempotency-Key` aceito em `POST /api/marcacoes`."
 * `API-COL-004-marcar.md`, Fluxo: "Se houver `Idempotency-Key`, consultar
 * Redis; se houver resultado, devolvê-lo e encerrar" / "Gravar resultado no
 * Redis sob a chave de idempotência (TTL 24h)".
 *
 * Reaproveita `@upstash/redis` (já dependência do projeto, mesmo cliente que
 * `src/server/http/rate-limit.ts` usa) em vez de introduzir outro backend de
 * KV. Chave namespaced por colaborador (`idempotencia:marcar-extra:{colaboradorId}:{chave}`)
 * — a spec não é explícita sobre escopo da chave, mas duas sessões
 * diferentes reusando o mesmo valor de `Idempotency-Key` por acaso não devem
 * colidir (o header é gerado pelo cliente, não pelo servidor).
 */
import { Redis } from '@upstash/redis';
import { env } from '@/env';

const TTL_SEGUNDOS = 24 * 60 * 60;

export interface StoreIdempotencia {
  buscar: (colaboradorId: string, chave: string) => Promise<unknown | null>;
  gravar: (colaboradorId: string, chave: string, valor: unknown) => Promise<void>;
}

function chaveRedis(colaboradorId: string, chave: string): string {
  return `idempotencia:marcar-extra:${colaboradorId}:${chave}`;
}

let redisSingleton: Redis | null = null;
function redisPadrao(): Redis {
  redisSingleton ??= new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  return redisSingleton;
}

/** Implementação real, sobre Redis — usada pela rota de verdade. */
export function criarStoreIdempotenciaRedis(redis: Redis = redisPadrao()): StoreIdempotencia {
  return {
    async buscar(colaboradorId, chave) {
      return (await redis.get(chaveRedis(colaboradorId, chave))) ?? null;
    },
    async gravar(colaboradorId, chave, valor) {
      await redis.set(chaveRedis(colaboradorId, chave), valor, { ex: TTL_SEGUNDOS });
    },
  };
}
