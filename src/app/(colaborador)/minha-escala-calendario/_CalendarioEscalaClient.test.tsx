import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CalendarioEscalaClient, type MinhaEscala } from './_CalendarioEscalaClient';
import type { CicloResumo } from '@/hooks/useNavegacaoCiclos';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function cicloResumo(ano: number, mes: number): CicloResumo {
  return { id: `ciclo-${ano}-${mes}`, ano, mes, janela: { abertura: null, fechamento: null, estado: 'ABERTA' }, permiteCruzada: false };
}

const CICLO_SETEMBRO = cicloResumo(2026, 9);

const escalaSetembro: MinhaEscala = {
  ciclo: { ano: 2026, mes: 9 },
  dias: [{ data: '2026-09-10', turno: 'DIURNO', codigo: 'D', descricaoCodigo: 'Disponível', presenca: true, horaInicio: '07:00', horaFim: '19:00' }],
  totais: { escalados: 1, extras: 0, horas: 12 },
};

const escalaOutubro: MinhaEscala = {
  ciclo: { ano: 2026, mes: 10 },
  dias: [{ data: '2026-10-05', turno: 'NOTURNO', codigo: 'D', descricaoCodigo: 'Disponível', presenca: true, horaInicio: '19:00', horaFim: '07:00' }],
  totais: { escalados: 1, extras: 0, horas: 12 },
};

describe('<CalendarioEscalaClient /> — navegação entre ciclos (pedido do usuário)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza o mês do ciclo inicial sem precisar buscar de novo', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(200, { anterior: null, atual: CICLO_SETEMBRO, proximo: null, servidorEm: 'x' }));
    render(<CalendarioEscalaClient cicloInicial={CICLO_SETEMBRO} escala={escalaSetembro} />);
    expect(screen.getAllByText((_, el) => el?.textContent === 'Setembro 2026')[0]).toBeInTheDocument();
    expect(screen.getByText(/Escalados/)).toBeInTheDocument();
  });

  it('pré-busca escala + marcações dos ciclos vizinhos assim que a navegação os revela', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/ciclos/vizinhos')) {
        return jsonResponse(200, { anterior: cicloResumo(2026, 8), atual: CICLO_SETEMBRO, proximo: cicloResumo(2026, 10), servidorEm: 'x' });
      }
      if (url.includes('/api/minha-escala') && url.includes('ciclo-2026-10')) return jsonResponse(200, escalaOutubro);
      if (url.includes('/api/minha-escala') && url.includes('ciclo-2026-8')) return jsonResponse(200, escalaOutubro);
      if (url.includes('/api/minhas-marcacoes')) return jsonResponse(200, { marcacoes: [], totais: { confirmadas: 0, canceladas: 0, horas: 0 } });
      return jsonResponse(200, escalaSetembro);
    });

    render(<CalendarioEscalaClient cicloInicial={CICLO_SETEMBRO} escala={escalaSetembro} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/minha-escala?cicloId=ciclo-2026-10'), expect.anything()));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/minha-escala?cicloId=ciclo-2026-8'), expect.anything()));
  });

  it('clicar em "próximo" troca pra outubro imediatamente, usando o dado já pré-buscado', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/ciclos/vizinhos')) {
        return jsonResponse(200, { anterior: null, atual: CICLO_SETEMBRO, proximo: cicloResumo(2026, 10), servidorEm: 'x' });
      }
      if (url.includes('/api/minha-escala') && url.includes('ciclo-2026-10')) return jsonResponse(200, escalaOutubro);
      if (url.includes('/api/minhas-marcacoes')) return jsonResponse(200, { marcacoes: [], totais: { confirmadas: 0, canceladas: 0, horas: 0 } });
      return jsonResponse(200, escalaSetembro);
    });

    render(<CalendarioEscalaClient cicloInicial={CICLO_SETEMBRO} escala={escalaSetembro} />);

    const botaoProximo = await screen.findByTitle(/ir para outubro/i);
    await waitFor(() => expect(botaoProximo).toBeEnabled());

    fireEvent.click(botaoProximo);

    await waitFor(() => expect(screen.getAllByText((_, el) => el?.textContent === 'Outubro 2026')[0]).toBeInTheDocument());
  });

  it('chevron "anterior" fica desabilitado quando não há ciclo publicado anterior', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/ciclos/vizinhos')) {
        return jsonResponse(200, { anterior: null, atual: CICLO_SETEMBRO, proximo: null, servidorEm: 'x' });
      }
      if (url.includes('/api/minhas-marcacoes')) return jsonResponse(200, { marcacoes: [], totais: { confirmadas: 0, canceladas: 0, horas: 0 } });
      return jsonResponse(200, escalaSetembro);
    });

    render(<CalendarioEscalaClient cicloInicial={CICLO_SETEMBRO} escala={escalaSetembro} />);

    const botaoAnterior = await screen.findByTitle(/nenhum ciclo publicado anterior/i);
    expect(botaoAnterior).toBeDisabled();
  });
});
