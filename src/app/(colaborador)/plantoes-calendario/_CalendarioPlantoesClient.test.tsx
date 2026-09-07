import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CalendarioPlantoesClient } from './_CalendarioPlantoesClient';
import type { GradePlantoesDados } from '@/components/plantoes/GradePlantoes';
import type { SaldoExtrasDados } from '@/components/extras/SaldoExtras';
import type { CicloResumo } from '@/hooks/useNavegacaoCiclos';

vi.mock('@/hooks/usePlantoesRealtime', () => ({
  usePlantoesRealtime: () => ({ estadoConexao: 'CONECTADO' }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function cicloResumo(ano: number, mes: number): CicloResumo {
  return { id: `ciclo-${ano}-${mes}`, ano, mes, janela: { abertura: null, fechamento: null, estado: 'ABERTA' }, permiteCruzada: false };
}

const CICLO_SETEMBRO = cicloResumo(2026, 9);

const dadosSetembro: GradePlantoesDados = {
  saldo: { limite: 4, usadas: 1, restantes: 3, permiteCruzada: true },
  plantoes: [
    {
      id: 'p-set',
      data: '2026-09-10',
      tipo: 'DIURNO',
      rt: 'RT A',
      horaInicio: '07:00',
      horaFim: '19:00',
      vagasTotais: 2,
      vagasOcupadas: 1,
      jaMarcado: false,
      disponivel: true,
      motivo: null,
    },
  ],
};

const dadosOutubro: GradePlantoesDados = {
  saldo: { limite: 4, usadas: 0, restantes: 4, permiteCruzada: true },
  plantoes: [
    {
      id: 'p-out',
      data: '2026-10-05',
      tipo: 'NOTURNO',
      rt: 'RT B',
      horaInicio: '19:00',
      horaFim: '07:00',
      vagasTotais: 1,
      vagasOcupadas: 0,
      jaMarcado: false,
      disponivel: true,
      motivo: null,
    },
  ],
};

const saldoInicial: SaldoExtrasDados = { limite: 4, usadas: 1, restantes: 3, permiteCruzada: true, bloqueado: false, motivoBloqueio: null };

describe('<CalendarioPlantoesClient /> — navegação entre ciclos (pedido do usuário)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza o mês do ciclo inicial sem precisar buscar de novo', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(200, { anterior: null, atual: CICLO_SETEMBRO, proximo: null, servidorEm: 'x' }));
    render(<CalendarioPlantoesClient cicloInicial={CICLO_SETEMBRO} dadosIniciais={dadosSetembro} saldoInicial={saldoInicial} />);
    expect(screen.getByText((_, el) => el?.textContent === 'Setembro 2026')).toBeInTheDocument();
  });

  it('pré-busca os dados dos ciclos vizinhos assim que a navegação os revela (antes de qualquer clique)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/ciclos/vizinhos')) {
        return jsonResponse(200, { anterior: cicloResumo(2026, 8), atual: CICLO_SETEMBRO, proximo: cicloResumo(2026, 10), servidorEm: 'x' });
      }
      if (url.includes('cicloId=ciclo-2026-10')) return jsonResponse(200, dadosOutubro);
      if (url.includes('cicloId=ciclo-2026-8')) return jsonResponse(200, dadosOutubro);
      return jsonResponse(200, dadosSetembro);
    });

    render(<CalendarioPlantoesClient cicloInicial={CICLO_SETEMBRO} dadosIniciais={dadosSetembro} saldoInicial={saldoInicial} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('cicloId=ciclo-2026-10'), expect.anything()));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('cicloId=ciclo-2026-8'), expect.anything()));
  });

  it('clicar em "próximo" troca pra outubro imediatamente, usando o dado já pré-buscado', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/ciclos/vizinhos')) {
        return jsonResponse(200, { anterior: null, atual: CICLO_SETEMBRO, proximo: cicloResumo(2026, 10), servidorEm: 'x' });
      }
      if (url.includes('cicloId=ciclo-2026-10')) return jsonResponse(200, dadosOutubro);
      return jsonResponse(200, dadosSetembro);
    });

    render(<CalendarioPlantoesClient cicloInicial={CICLO_SETEMBRO} dadosIniciais={dadosSetembro} saldoInicial={saldoInicial} />);

    const botaoProximo = await screen.findByTitle(/ir para outubro/i);
    await waitFor(() => expect(botaoProximo).toBeEnabled());

    fireEvent.click(botaoProximo);

    await waitFor(() => expect(screen.getByText((_, el) => el?.textContent === 'Outubro 2026')).toBeInTheDocument());
  });

  it('chevron "anterior" fica desabilitado quando não há ciclo publicado anterior', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/ciclos/vizinhos')) {
        return jsonResponse(200, { anterior: null, atual: CICLO_SETEMBRO, proximo: null, servidorEm: 'x' });
      }
      return jsonResponse(200, dadosSetembro);
    });

    render(<CalendarioPlantoesClient cicloInicial={CICLO_SETEMBRO} dadosIniciais={dadosSetembro} saldoInicial={saldoInicial} />);

    const botaoAnterior = await screen.findByTitle(/nenhum ciclo publicado anterior/i);
    expect(botaoAnterior).toBeDisabled();
  });
});
