import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlantoesRealtime } from './usePlantoesRealtime';

const onMock = vi.fn().mockReturnThis();
const subscribeMock = vi.fn().mockReturnThis();
const channelMock = vi.fn(() => ({ on: onMock, subscribe: subscribeMock }));
const removeChannelMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ channel: channelMock, removeChannel: removeChannelMock }),
}));

vi.mock('@/env', () => ({
  env: { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' },
}));

/** Callback de status passado ao `subscribe()` na N-ésima chamada de `conectar()` (0-based). */
function callbackDeStatus(chamada: number): (status: string) => void {
  return subscribeMock.mock.calls[chamada]![0] as (status: string) => void;
}

function definirVisibilidade(estado: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: estado, configurable: true });
}

describe('usePlantoesRealtime — RT-001 (frontend)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    channelMock.mockClear();
    onMock.mockClear();
    subscribeMock.mockClear();
    removeChannelMock.mockClear();
    definirVisibilidade('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('não assina nenhum canal quando cicloId é nulo/ausente', () => {
    renderHook(() => usePlantoesRealtime(null, vi.fn()));
    expect(channelMock).not.toHaveBeenCalled();
  });

  it('assina o canal `ciclo:{cicloId}` e escuta plantao + broadcasts de marcação', () => {
    renderHook(() => usePlantoesRealtime('ciclo-1', vi.fn()));
    expect(channelMock).toHaveBeenCalledWith('ciclo:ciclo-1');
    expect(onMock).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({ table: 'plantao' }), expect.any(Function));
    expect(onMock).toHaveBeenCalledWith('broadcast', { event: 'marcacao:criada' }, expect.any(Function));
    expect(onMock).toHaveBeenCalledWith('broadcast', { event: 'marcacao:cancelada' }, expect.any(Function));
  });

  it('faz debounce de 500ms — vários eventos seguidos disparam um único callback (RT-6)', () => {
    const onEvento = vi.fn();
    renderHook(() => usePlantoesRealtime('ciclo-1', onEvento));

    const callback = onMock.mock.calls[0]![2] as () => void;
    callback();
    callback();
    callback();

    vi.advanceTimersByTime(499);
    expect(onEvento).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onEvento).toHaveBeenCalledTimes(1);
  });

  it('remove o canal ao desmontar', () => {
    const { unmount } = renderHook(() => usePlantoesRealtime('ciclo-1', vi.fn()));
    unmount();
    expect(removeChannelMock).toHaveBeenCalled();
  });

  it('estado inicial é CONECTANDO e vira CONECTADO quando o Supabase confirma a inscrição', () => {
    const { result } = renderHook(() => usePlantoesRealtime('ciclo-1', vi.fn()));
    expect(result.current.estadoConexao).toBe('CONECTANDO');

    act(() => callbackDeStatus(0)('SUBSCRIBED'));
    expect(result.current.estadoConexao).toBe('CONECTADO');
  });
});

describe('usePlantoesRealtime — RT-002 (fallback e reconexão)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    channelMock.mockClear();
    onMock.mockClear();
    subscribeMock.mockClear();
    removeChannelMock.mockClear();
    definirVisibilidade('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('RT2-5 / RT-002.1: backoff exponencial 1s/2s/4s/8s, com teto de 30s', () => {
    const { result } = renderHook(() => usePlantoesRealtime('ciclo-1', vi.fn()));

    // 1ª falha → RECONECTANDO, próxima tentativa em 1s.
    act(() => callbackDeStatus(0)('CHANNEL_ERROR'));
    expect(result.current.estadoConexao).toBe('RECONECTANDO');
    expect(channelMock).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(999));
    expect(channelMock).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(channelMock).toHaveBeenCalledTimes(2);

    // 2ª falha → próxima tentativa em 2s.
    act(() => callbackDeStatus(1)('CHANNEL_ERROR'));
    act(() => vi.advanceTimersByTime(1999));
    expect(channelMock).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(1));
    expect(channelMock).toHaveBeenCalledTimes(3);

    // 3ª falha → DEGRADADO, mas a tentativa de reconexão em paralelo continua
    // agendada; próxima em 4s (2^2 * 1s).
    act(() => callbackDeStatus(2)('CHANNEL_ERROR'));
    expect(result.current.estadoConexao).toBe('DEGRADADO');
    act(() => vi.advanceTimersByTime(3999));
    expect(channelMock).toHaveBeenCalledTimes(3);
    act(() => vi.advanceTimersByTime(1));
    expect(channelMock).toHaveBeenCalledTimes(4);

    // 4ª falha → 8s.
    act(() => callbackDeStatus(3)('CHANNEL_ERROR'));
    act(() => vi.advanceTimersByTime(7999));
    expect(channelMock).toHaveBeenCalledTimes(4);
    act(() => vi.advanceTimersByTime(1));
    expect(channelMock).toHaveBeenCalledTimes(5);

    // 5ª falha → 16s (2^4 * 1s), ainda abaixo do teto.
    act(() => callbackDeStatus(4)('CHANNEL_ERROR'));
    act(() => vi.advanceTimersByTime(15999));
    expect(channelMock).toHaveBeenCalledTimes(5);
    act(() => vi.advanceTimersByTime(1));
    expect(channelMock).toHaveBeenCalledTimes(6);

    // 6ª falha → 2^5 * 1s = 32s estouraria o teto; fica em 30s.
    act(() => callbackDeStatus(5)('CHANNEL_ERROR'));
    act(() => vi.advanceTimersByTime(29999));
    expect(channelMock).toHaveBeenCalledTimes(6);
    act(() => vi.advanceTimersByTime(1));
    expect(channelMock).toHaveBeenCalledTimes(7);
  });

  it('RT2-1 / RT-002.2: após 3 falhas, entra em DEGRADADO e liga polling — refetch em ≤ 20s', () => {
    const onEvento = vi.fn();
    const { result } = renderHook(() => usePlantoesRealtime('ciclo-1', onEvento));

    act(() => callbackDeStatus(0)('CHANNEL_ERROR'));
    act(() => vi.advanceTimersByTime(1000)); // conectar() de novo (1s)
    act(() => callbackDeStatus(1)('CHANNEL_ERROR'));
    act(() => vi.advanceTimersByTime(2000)); // conectar() de novo (2s)
    act(() => callbackDeStatus(2)('CHANNEL_ERROR'));

    expect(result.current.estadoConexao).toBe('DEGRADADO');
    onEvento.mockClear();

    act(() => vi.advanceTimersByTime(20000));
    expect(onEvento).toHaveBeenCalled();
  });

  it('RT2-2 / RT-002.4: ao reconectar depois de falhas, dispara refetch completo (sem esperar debounce)', () => {
    const onEvento = vi.fn();
    renderHook(() => usePlantoesRealtime('ciclo-1', onEvento));

    act(() => callbackDeStatus(0)('CHANNEL_ERROR'));
    onEvento.mockClear();

    act(() => vi.advanceTimersByTime(1000));
    act(() => callbackDeStatus(1)('SUBSCRIBED'));

    // Refetch imediato — não precisa avançar os 500ms de debounce.
    expect(onEvento).toHaveBeenCalledTimes(1);
  });

  it('não dispara refetch na primeira conexão bem-sucedida (sem falha anterior)', () => {
    const onEvento = vi.fn();
    renderHook(() => usePlantoesRealtime('ciclo-1', onEvento));

    act(() => callbackDeStatus(0)('SUBSCRIBED'));

    expect(onEvento).not.toHaveBeenCalled();
  });

  it('RT2-4 / RT-002.5: aba em background reduz polling degradado para 60s; volta ao foco → refetch imediato e polling volta a 15s', () => {
    const onEvento = vi.fn();
    const { result } = renderHook(() => usePlantoesRealtime('ciclo-1', onEvento));

    act(() => callbackDeStatus(0)('CHANNEL_ERROR'));
    act(() => vi.advanceTimersByTime(1000));
    act(() => callbackDeStatus(1)('CHANNEL_ERROR'));
    act(() => vi.advanceTimersByTime(2000));
    act(() => callbackDeStatus(2)('CHANNEL_ERROR'));
    expect(result.current.estadoConexao).toBe('DEGRADADO');

    onEvento.mockClear();
    definirVisibilidade('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    // Com a aba em background, 15s não é mais suficiente — só o polling de 60s dispara.
    act(() => vi.advanceTimersByTime(15000));
    expect(onEvento).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(45000)); // completa 60s
    expect(onEvento).toHaveBeenCalledTimes(1);

    onEvento.mockClear();
    definirVisibilidade('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    // Refetch imediato ao voltar ao foco.
    expect(onEvento).toHaveBeenCalledTimes(1);

    // E o polling volta a 15s.
    onEvento.mockClear();
    act(() => vi.advanceTimersByTime(15000));
    expect(onEvento).toHaveBeenCalledTimes(1);
  });

  it('RT2-3 / RT-002.6: em DEGRADADO, o estado de conexão não interfere na chamada de marcar extra (o hook só expõe o estado, quem marca é uma chamada HTTP direta e alheia a ele)', () => {
    const onEvento = vi.fn();
    const { result } = renderHook(() => usePlantoesRealtime('ciclo-1', onEvento));

    act(() => callbackDeStatus(0)('CHANNEL_ERROR'));
    act(() => vi.advanceTimersByTime(1000));
    act(() => callbackDeStatus(1)('CHANNEL_ERROR'));
    act(() => vi.advanceTimersByTime(2000));
    act(() => callbackDeStatus(2)('CHANNEL_ERROR'));
    expect(result.current.estadoConexao).toBe('DEGRADADO');

    // O hook não expõe nenhuma função de bloqueio/gate — só o estado, um
    // valor de leitura. Nada aqui impede ou precisa ser consultado por uma
    // chamada HTTP de marcar extra (ver GradePlantoes.tsx, que nunca importa
    // nem lê `estadoConexao`).
    expect(Object.keys(result.current)).toEqual(['estadoConexao']);
  });
});
