/**
 * Testes de `criarStoreIdempotenciaRedis` — suporte a `Idempotency-Key`
 * exigido por `specs/04-api/colaborador/API-COL-004-marcar.md` (teste #3:
 * "Mesmo `Idempotency-Key` 3× | 1 marcação, 3 respostas iguais").
 *
 * Mesmo padrão de `src/server/realtime/broadcast.test.ts`: stub das
 * variáveis de ambiente exigidas por `@/env` em `beforeAll`, e um cliente
 * Redis fake injetado (nenhum teste toca Redis real).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Redis } from '@upstash/redis';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:6543/extras?pgbouncer=true';
  process.env.DIRECT_URL ??= 'postgresql://postgres:postgres@localhost:5432/extras';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'teste';
  process.env.SESSION_SECRET ??= 'a'.repeat(32);
  process.env.CPF_PEPPER ??= 'pepper-cpf-teste';
  process.env.PIN_PEPPER ??= 'pepper-pin-teste';
  process.env.UPSTASH_REDIS_REST_URL ??= 'https://exemplo.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ??= 'teste';
  process.env.TZ ??= 'America/Sao_Paulo';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://exemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'teste';
});

function criarRedisFake(): { redis: Redis; store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  const redis = {
    get: vi.fn(async (chave: string) => store.get(chave) ?? null),
    set: vi.fn(async (chave: string, valor: unknown) => {
      store.set(chave, valor);
      return 'OK';
    }),
  } as unknown as Redis;
  return { redis, store };
}

describe('criarStoreIdempotenciaRedis', () => {
  it('buscar() devolve null quando a chave nunca foi gravada', async () => {
    const { criarStoreIdempotenciaRedis } = await import('./idempotencia');
    const { redis } = criarRedisFake();
    const store = criarStoreIdempotenciaRedis(redis);

    await expect(store.buscar('colab-1', 'chave-1')).resolves.toBeNull();
  });

  it('gravar() seguido de buscar() devolve exatamente o mesmo valor (#3: 3 respostas iguais)', async () => {
    const { criarStoreIdempotenciaRedis } = await import('./idempotencia');
    const { redis } = criarRedisFake();
    const store = criarStoreIdempotenciaRedis(redis);

    const valor = { id: 'marc-1', plantaoId: 'plantao-1' };
    await store.gravar('colab-1', 'chave-1', valor);

    await expect(store.buscar('colab-1', 'chave-1')).resolves.toEqual(valor);
    await expect(store.buscar('colab-1', 'chave-1')).resolves.toEqual(valor);
    await expect(store.buscar('colab-1', 'chave-1')).resolves.toEqual(valor);
  });

  it('grava com TTL de 24h (86400s)', async () => {
    const { criarStoreIdempotenciaRedis } = await import('./idempotencia');
    const { redis } = criarRedisFake();
    const store = criarStoreIdempotenciaRedis(redis);

    await store.gravar('colab-1', 'chave-1', { ok: true });
    expect(vi.mocked(redis.set)).toHaveBeenCalledWith(expect.any(String), { ok: true }, { ex: 24 * 60 * 60 });
  });

  it('chave namespaced por colaborador — dois colaboradores com a mesma Idempotency-Key não colidem', async () => {
    const { criarStoreIdempotenciaRedis } = await import('./idempotencia');
    const { redis, store: dadosCrus } = criarRedisFake();
    const store = criarStoreIdempotenciaRedis(redis);

    await store.gravar('colab-1', 'mesma-chave', { dono: 'colab-1' });
    await store.gravar('colab-2', 'mesma-chave', { dono: 'colab-2' });

    expect(dadosCrus.size).toBe(2);
    await expect(store.buscar('colab-1', 'mesma-chave')).resolves.toEqual({ dono: 'colab-1' });
    await expect(store.buscar('colab-2', 'mesma-chave')).resolves.toEqual({ dono: 'colab-2' });
  });
});
