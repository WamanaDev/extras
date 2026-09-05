/**
 * PENDENTE DE EXECUÇÃO NESTE AMBIENTE: depende de `@upstash/ratelimit` e
 * `@upstash/redis`, não instalados (sem `node_modules` / sem acesso à rede
 * neste agente). O teste é a especificação executável do contrato — deve
 * rodar em CI. Os testes de carga real (D1 "150 clientes simultâneos") e de
 * queda de Redis (D2) exigem infraestrutura real e ficam marcados como
 * `it.skip` com o motivo documentado, mesmo em CI — são testes de
 * integração/carga, não de unidade.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

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

describe('rate-limit — configuração e assimetria falha aberta/fechada (SEC-DISP)', () => {
  it('login falha fechado; leituras e escrita de negócio falham aberto', async () => {
    const { falhaFechadaPara } = await import('./rate-limit');
    expect(falhaFechadaPara('login_matricula')).toBe(true);
    expect(falhaFechadaPara('login_matricula_acumulado')).toBe(true);
    expect(falhaFechadaPara('login_ip')).toBe(true);
    expect(falhaFechadaPara('login_ip_acumulado')).toBe(true);
    expect(falhaFechadaPara('leitura_por_sessao')).toBe(false);
    expect(falhaFechadaPara('marcacoes_por_sessao')).toBe(false);
    expect(falhaFechadaPara('global_por_ip')).toBe(false);
  });

  it('verificarRateLimit: Redis indisponível em escopo de login devolve permitido=false (D2)', async () => {
    const { verificarRateLimit } = await import('./rate-limit');
    const limitadorQueFalha = {
      login_matricula: { limit: vi.fn().mockRejectedValue(new Error('redis indisponível')) },
    } as unknown as Parameters<typeof verificarRateLimit>[2];

    const decisao = await verificarRateLimit('login_matricula', 'matricula-123', limitadorQueFalha);
    expect(decisao.permitido).toBe(false);
  });

  it('verificarRateLimit: Redis indisponível em escopo de leitura devolve permitido=true (D2)', async () => {
    const { verificarRateLimit } = await import('./rate-limit');
    const limitadorQueFalha = {
      leitura_por_sessao: { limit: vi.fn().mockRejectedValue(new Error('redis indisponível')) },
    } as unknown as Parameters<typeof verificarRateLimit>[2];

    const decisao = await verificarRateLimit('leitura_por_sessao', 'sessao-abc', limitadorQueFalha);
    expect(decisao.permitido).toBe(true);
  });

  it('verificarRateLimit: sucesso do Redis repassa limite/restante/retryAfter', async () => {
    const { verificarRateLimit } = await import('./rate-limit');
    const reset = Date.now() + 5000;
    const limitadorOk = {
      marcacoes_por_sessao: {
        limit: vi.fn().mockResolvedValue({ success: true, limit: 10, remaining: 9, reset }),
      },
    } as unknown as Parameters<typeof verificarRateLimit>[2];

    const decisao = await verificarRateLimit('marcacoes_por_sessao', 'sessao-abc', limitadorOk);
    expect(decisao).toMatchObject({ permitido: true, limite: 10, restante: 9 });
    expect(decisao.retryAfter).toBeGreaterThanOrEqual(0);
  });

  it.skip('D1: 150 clientes simultâneos na abertura — requer infraestrutura de carga real', () => {});
  it.skip('D2 (integração real): Redis derrubado durante o pico — requer Redis real', () => {});
});
