/**
 * PENDENTE DE EXECUÇÃO NESTE AMBIENTE: `argon2` é um módulo nativo e este
 * workspace não tem `node_modules` instalado (sem acesso à rede no ambiente
 * do agente). O teste está correto e deve rodar em CI / máquina com
 * `pnpm install` — aqui ele documenta o contrato esperado.
 */
import { beforeAll, describe, expect, it } from 'vitest';

// env.ts exige DATABASE_URL, DIRECT_URL etc. no boot — define valores
// sintéticos de teste antes de importar qualquer módulo que os leia.
beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:6543/extras?pgbouncer=true';
  process.env.DIRECT_URL ??= 'postgresql://postgres:postgres@localhost:5432/extras';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'teste';
  process.env.SESSION_SECRET ??= 'a'.repeat(32);
  process.env.PIN_PEPPER ??= 'pepper-pin-teste';
  process.env.UPSTASH_REDIS_REST_URL ??= 'https://exemplo.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ??= 'teste';
  process.env.TZ ??= 'America/Sao_Paulo';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://exemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'teste';
});

describe('credenciais — argon2id com pepper (SEC-CONF)', () => {
  it('hashPin/verificarPin: hash nunca é o PIN em claro, e verifica corretamente', async () => {
    const { hashPin, verificarPin } = await import('./credenciais');
    const hash = await hashPin('705318');
    expect(hash).not.toContain('705318');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verificarPin('705318', hash)).resolves.toBe(true);
    await expect(verificarPin('000000', hash)).resolves.toBe(false);
  });

  it('verificarPin com hash malformado devolve false, nunca lança', async () => {
    const { verificarPin } = await import('./credenciais');
    await expect(verificarPin('705318', 'nao-e-um-hash-argon2')).resolves.toBe(false);
  });

  it('gerarTokenSessao/hashDoToken: token nunca é igual ao seu próprio hash, hash é determinístico', async () => {
    const { gerarTokenSessao, hashDoToken } = await import('./credenciais');
    const { token, tokenHash } = gerarTokenSessao();
    expect(token).not.toBe(tokenHash);
    expect(hashDoToken(token)).toBe(tokenHash);
    // 32 bytes em base64url têm ao menos 42 caracteres.
    expect(token.length).toBeGreaterThanOrEqual(42);
  });

  it('compararComHashDummy roda sem lançar (defesa de enumeração S4/C5)', async () => {
    const { compararComHashDummy } = await import('./credenciais');
    await expect(compararComHashDummy()).resolves.toBeUndefined();
  });
});
