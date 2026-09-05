import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

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

describe('broadcast — RT-001 (implementação mínima, ver docstring do módulo)', () => {
  it('emite no canal ciclo:{cicloId} e limpa o canal depois (RT-001, "Broadcast só após commit")', async () => {
    const { broadcast } = await import('./broadcast');
    const send = vi.fn(async () => ({ error: null }));
    const channel = vi.fn(() => ({ send }));
    const removeChannel = vi.fn();
    const clienteFake = { channel, removeChannel } as unknown as SupabaseClient;

    await broadcast('ciclo-1', 'marcacao:criada', { plantaoId: 'plantao-1' }, clienteFake);

    expect(channel).toHaveBeenCalledWith('ciclo:ciclo-1');
    expect(send).toHaveBeenCalledWith({ type: 'broadcast', event: 'marcacao:criada', payload: { plantaoId: 'plantao-1' } });
    expect(removeChannel).toHaveBeenCalled();
  });

  it('nunca lança — falha de rede é best-effort (RT-001 é notificação, não fonte de verdade)', async () => {
    const { broadcast } = await import('./broadcast');
    const channel = vi.fn(() => {
      throw new Error('rede fora');
    });
    const clienteFake = { channel, removeChannel: vi.fn() } as unknown as SupabaseClient;

    await expect(broadcast('ciclo-1', 'marcacao:cancelada', { plantaoId: 'p1' }, clienteFake)).resolves.toBeUndefined();
  });

  it('payload de marcacao:criada nunca inclui colaboradorId (RT-3)', async () => {
    const { broadcast } = await import('./broadcast');
    const send = vi.fn(async (_mensagem: { payload: Record<string, unknown> }) => ({ error: null }));
    const clienteFake = { channel: vi.fn(() => ({ send })), removeChannel: vi.fn() } as unknown as SupabaseClient;

    await broadcast('ciclo-1', 'marcacao:criada', { plantaoId: 'p1' }, clienteFake);

    const chamada = send.mock.calls[0];
    expect(chamada).toBeDefined();
    const payloadEnviado = chamada![0];
    expect(payloadEnviado.payload).not.toHaveProperty('colaboradorId');
  });
});
