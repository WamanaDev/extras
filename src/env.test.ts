/**
 * FUND-004 — `src/env.ts` corrige `process.env.TZ` sozinho no boot, porque
 * `TZ` é nome reservado na Vercel (não configurável via dashboard/
 * `vercel.json` — achado em uso real, build falhava com "TZ deve ser
 * exatamente 'America/Sao_Paulo'"). Ver `_conflitos.md`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_ORIGINAL = { ...process.env };

function envValidoMinimo(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: 'postgresql://user:pass@localhost:6543/db?pgbouncer=true',
    DIRECT_URL: 'postgresql://user:pass@localhost:5432/db',
    SUPABASE_SERVICE_ROLE_KEY: 'teste',
    SESSION_SECRET: 'a'.repeat(32),
    PIN_PEPPER: 'pepper-teste',
    UPSTASH_REDIS_REST_URL: 'https://exemplo.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'teste',
    NEXT_PUBLIC_SUPABASE_URL: 'https://exemplo.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'teste',
  };
}

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
  vi.resetModules();
});

describe('src/env.ts — TZ auto-corrigido (reservado na Vercel)', () => {
  it('TZ ausente (como na Vercel, onde não dá pra configurar) não derruba o boot — é setado sozinho', async () => {
    process.env = envValidoMinimo();
    delete process.env.TZ;

    const { env } = await import('./env');

    expect(env.TZ).toBe('America/Sao_Paulo');
    expect(process.env.TZ).toBe('America/Sao_Paulo');
  });

  it('TZ com valor errado é corrigido, não motivo de falha', async () => {
    process.env = envValidoMinimo();
    process.env.TZ = 'UTC';

    const { env } = await import('./env');

    expect(env.TZ).toBe('America/Sao_Paulo');
  });

  it('TZ já correto continua correto (idempotente)', async () => {
    process.env = envValidoMinimo();
    process.env.TZ = 'America/Sao_Paulo';

    const { env } = await import('./env');

    expect(env.TZ).toBe('America/Sao_Paulo');
  });
});
