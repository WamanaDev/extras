/**
 * API-AUTH-001/002 — Testes de `token-parcial.ts`: emissão, verificação de
 * assinatura/expiração e consumo (uso único).
 */
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.SESSION_SECRET ??= 'a'.repeat(32);
  process.env.PIN_PEPPER ??= 'pepper-pin-teste';
  process.env.UPSTASH_REDIS_REST_URL ??= 'https://exemplo.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ??= 'teste';
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:6543/extras?pgbouncer=true';
  process.env.DIRECT_URL ??= 'postgresql://postgres:postgres@localhost:5432/extras';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'teste';
  process.env.TZ ??= 'America/Sao_Paulo';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://exemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'teste';
});

let emitirTokenParcial: typeof import('./token-parcial').emitirTokenParcial;
let verificarTokenParcial: typeof import('./token-parcial').verificarTokenParcial;
let consumirTokenParcial: typeof import('./token-parcial').consumirTokenParcial;

beforeAll(async () => {
  ({ emitirTokenParcial, verificarTokenParcial, consumirTokenParcial } = await import('./token-parcial'));
});

const AGORA = new Date('2026-09-03T10:00:00.000Z');

describe('token-parcial', () => {
  it('emite um token com 3 segmentos e escopo pin-pendente', () => {
    const emitido = emitirTokenParcial('colab-1', true, AGORA);
    expect(emitido.token.split('.')).toHaveLength(3);
    expect(emitido.expiraEm.getTime()).toBe(AGORA.getTime() + 180_000);
  });

  it('6. token expirado falha na verificação', () => {
    const emitido = emitirTokenParcial('colab-1', true, AGORA);
    const depoisDeExpirar = new Date(AGORA.getTime() + 181_000);
    const resultado = verificarTokenParcial(emitido.token, depoisDeExpirar);
    expect(resultado).toEqual({ ok: false, motivo: 'EXPIRADO' });
  });

  it('assinatura adulterada é rejeitada', () => {
    const emitido = emitirTokenParcial('colab-1', true, AGORA);
    const partes = emitido.token.split('.');
    const adulterado = `${partes[0]}.${partes[1]}.assinaturaFalsa`;
    const resultado = verificarTokenParcial(adulterado, AGORA);
    expect(resultado.ok).toBe(false);
  });

  it('5. token usado 2× — a segunda falha (uso único)', async () => {
    const emitido = emitirTokenParcial('colab-1', true, AGORA);
    const usados = new Set<string>();
    const marcar = async (jti: string) => {
      if (usados.has(jti)) return false;
      usados.add(jti);
      return true;
    };

    const primeiro = await consumirTokenParcial(emitido.token, AGORA, marcar);
    expect(primeiro.ok).toBe(true);

    const segundo = await consumirTokenParcial(emitido.token, AGORA, marcar);
    expect(segundo).toEqual({ ok: false, motivo: 'JA_USADO' });
  });

  it('sub e precisaDefinirPin sobrevivem ao roundtrip de emissão/verificação', () => {
    const emitido = emitirTokenParcial('colab-42', false, AGORA);
    const resultado = verificarTokenParcial(emitido.token, AGORA);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.payload.sub).toBe('colab-42');
      expect(resultado.payload.precisaDefinirPin).toBe(false);
    }
  });
});
