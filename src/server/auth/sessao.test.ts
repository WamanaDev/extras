/**
 * API-AUTH-002/005 — Testes de `calcularRenovacaoSessao` (renovação
 * deslizante usada por `GET /api/auth/me`).
 *
 * `./sessao` importa `./credenciais`, que importa `@/env` (validação eager no
 * carregamento do módulo, schema completo — server + client). Por isso o
 * `import` de `./sessao` é adiado para dentro de `beforeAll`, depois de
 * `process.env` estar completo — mesmo padrão de `validar-pin.test.ts`.
 */
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.PIN_PEPPER ??= 'pepper-pin-teste';
  process.env.SESSION_SECRET ??= 'a'.repeat(32);
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:6543/extras?pgbouncer=true';
  process.env.DIRECT_URL ??= 'postgresql://postgres:postgres@localhost:5432/extras';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'teste';
  process.env.UPSTASH_REDIS_REST_URL ??= 'https://exemplo.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ??= 'teste';
  process.env.TZ ??= 'America/Sao_Paulo';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://exemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'teste';
});

let calcularRenovacaoSessao: typeof import('./sessao').calcularRenovacaoSessao;
let DURACAO_SESSAO_MS: typeof import('./sessao').DURACAO_SESSAO_MS;
let LIMIAR_RENOVACAO_MS: typeof import('./sessao').LIMIAR_RENOVACAO_MS;
let TETO_SESSAO_MS: typeof import('./sessao').TETO_SESSAO_MS;

beforeAll(async () => {
  ({ calcularRenovacaoSessao, DURACAO_SESSAO_MS, LIMIAR_RENOVACAO_MS, TETO_SESSAO_MS } = await import('./sessao'));
});

describe('API-AUTH-005 calcularRenovacaoSessao', () => {
  it('não renova quando restam >= 2h', () => {
    const criadoEm = new Date('2026-09-03T00:00:00.000Z');
    const agora = new Date('2026-09-03T02:00:00.000Z'); // sessão criada há 2h, 8h de duração → resta 6h
    const expiraEm = new Date(criadoEm.getTime() + DURACAO_SESSAO_MS);
    expect(calcularRenovacaoSessao({ criadoEm, expiraEm }, agora)).toBeNull();
  });

  it('5. restando 1h → renova para +8h, respeitando o teto de 12h desde a criação', () => {
    const criadoEm = new Date('2026-09-03T00:00:00.000Z');
    const expiraEm = new Date(criadoEm.getTime() + DURACAO_SESSAO_MS); // 08:00
    const agora = new Date(expiraEm.getTime() - 60 * 60 * 1000); // 07:00, resta 1h < limiar de 2h

    const nova = calcularRenovacaoSessao({ criadoEm, expiraEm }, agora);
    expect(nova).not.toBeNull();

    const tetoAbsoluto = criadoEm.getTime() + TETO_SESSAO_MS; // 12:00
    const candidataSemTeto = agora.getTime() + DURACAO_SESSAO_MS; // 07:00 + 8h = 15:00, acima do teto
    expect(nova!.getTime()).toBe(Math.min(candidataSemTeto, tetoAbsoluto));
    expect(nova!.getTime()).toBeLessThanOrEqual(tetoAbsoluto);
  });

  it('já no teto de 12h — não renova mais (evita sessão "eterna")', () => {
    const criadoEm = new Date('2026-09-03T00:00:00.000Z');
    const expiraEm = new Date(criadoEm.getTime() + TETO_SESSAO_MS); // já no teto
    const agora = new Date(expiraEm.getTime() - 30 * 60 * 1000); // resta 30min < limiar

    expect(calcularRenovacaoSessao({ criadoEm, expiraEm }, agora)).toBeNull();
  });

  it('limiar exato de 2h ainda não dispara renovação', () => {
    const criadoEm = new Date('2026-09-03T00:00:00.000Z');
    const expiraEm = new Date(criadoEm.getTime() + DURACAO_SESSAO_MS);
    const agora = new Date(expiraEm.getTime() - LIMIAR_RENOVACAO_MS);
    expect(calcularRenovacaoSessao({ criadoEm, expiraEm }, agora)).toBeNull();
  });
});
