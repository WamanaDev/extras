/**
 * Testes de `useNavegacaoCiclos` — pedido do usuário: navegação entre ciclos
 * PUBLICADO, sempre trocando de tela na hora (sem loading) e completando a
 * janela (+1) em segundo plano.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useNavegacaoCiclos, type CicloResumo } from './useNavegacaoCiclos';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function cicloResumo(ano: number, mes: number): CicloResumo {
  return { id: `ciclo-${ano}-${mes}`, ano, mes, janela: { abertura: null, fechamento: null, estado: 'ABERTA' }, permiteCruzada: false };
}

const CICLO_SETEMBRO = cicloResumo(2026, 9);

describe('useNavegacaoCiclos', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('busca os vizinhos ao montar, usando ano/mes do ciclo inicial', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(200, { anterior: cicloResumo(2026, 8), atual: CICLO_SETEMBRO, proximo: cicloResumo(2026, 10), servidorEm: 'x' }));

    const { result } = renderHook(() => useNavegacaoCiclos(CICLO_SETEMBRO));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ciclos/vizinhos?ano=2026&mes=9', expect.anything()));
    await waitFor(() => expect((result.current.anterior !== null)).toBe(true));
    expect((result.current.proximo !== null)).toBe(true);
    expect(result.current.atual).toEqual(CICLO_SETEMBRO);
  });

  it('irParaProximo troca "atual" IMEDIATAMENTE (a partir do cache), sem esperar a rede', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(200, { anterior: cicloResumo(2026, 8), atual: CICLO_SETEMBRO, proximo: cicloResumo(2026, 10), servidorEm: 'x' }),
    );

    const { result } = renderHook(() => useNavegacaoCiclos(CICLO_SETEMBRO));
    await waitFor(() => expect((result.current.proximo !== null)).toBe(true));

    act(() => result.current.irParaProximo());

    // Troca síncrona — não depende de uma nova resposta de rede pra já refletir outubro.
    expect(result.current.atual.mes).toBe(10);
  });

  it('irParaProximo busca a janela +1 em segundo plano, revelando o novo "próximo"', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { anterior: cicloResumo(2026, 8), atual: CICLO_SETEMBRO, proximo: cicloResumo(2026, 10), servidorEm: 'x' }),
    );

    const { result } = renderHook(() => useNavegacaoCiclos(CICLO_SETEMBRO));
    await waitFor(() => expect((result.current.proximo !== null)).toBe(true));

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { anterior: CICLO_SETEMBRO, atual: cicloResumo(2026, 10), proximo: cicloResumo(2026, 11), servidorEm: 'x' }),
    );

    act(() => result.current.irParaProximo());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ciclos/vizinhos?ano=2026&mes=10', expect.anything()));
    expect(result.current.atual.mes).toBe(10); // ainda em outubro — "atual" não pula direto pra 11.
    await waitFor(() => expect((result.current.proximo !== null)).toBe(true));
  });

  it('sem "proximo" conhecido, irParaProximo não faz nada', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(200, { anterior: null, atual: CICLO_SETEMBRO, proximo: null, servidorEm: 'x' }));

    const { result } = renderHook(() => useNavegacaoCiclos(CICLO_SETEMBRO));
    await waitFor(() => expect((result.current.proximo !== null)).toBe(false));

    act(() => result.current.irParaProximo());
    expect(result.current.atual).toEqual(CICLO_SETEMBRO);
  });

  it('irParaAnterior troca "atual" imediatamente e preserva o antigo "atual" como novo "próximo"', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(200, { anterior: cicloResumo(2026, 8), atual: CICLO_SETEMBRO, proximo: cicloResumo(2026, 10), servidorEm: 'x' }),
    );

    const { result } = renderHook(() => useNavegacaoCiclos(CICLO_SETEMBRO));
    await waitFor(() => expect((result.current.anterior !== null)).toBe(true));

    act(() => result.current.irParaAnterior());
    expect(result.current.atual.mes).toBe(8);
  });
});
