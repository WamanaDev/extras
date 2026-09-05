import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PlantoesClient } from './_PlantoesClient';
import type { GradePlantoesDados } from '@/components/plantoes/GradePlantoes';
import type { SaldoExtrasDados } from '@/components/extras/SaldoExtras';

let onEventoCapturado: (() => void) | null = null;
vi.mock('@/hooks/usePlantoesRealtime', () => ({
  usePlantoesRealtime: (_cicloId: string, onEvento: () => void) => {
    onEventoCapturado = onEvento;
  },
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const dadosIniciais: GradePlantoesDados = {
  saldo: { limite: 4, usadas: 1, restantes: 3, permiteCruzada: true },
  plantoes: [
    {
      id: 'p1',
      data: '2026-01-10',
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

const saldoInicial: SaldoExtrasDados = {
  limite: 4,
  usadas: 1,
  restantes: 3,
  permiteCruzada: true,
  bloqueado: false,
  motivoBloqueio: null,
};

describe('<PlantoesClient /> — cola de Realtime da grade de extras (RT-001)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    onEventoCapturado = null;
  });

  it('renderiza a grade e o saldo a partir dos dados iniciais, sem tela branca', () => {
    render(<PlantoesClient cicloId="ciclo-1" dadosIniciais={dadosIniciais} saldoInicial={saldoInicial} />);
    expect(screen.getByText(/extras usadas/i)).toBeInTheDocument();
    expect(screen.getByTestId('plantao-p1')).toBeInTheDocument();
  });

  it('um evento de Realtime remonta a grade (refetch — RT-001 "Regra de refetch")', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(200, {
        saldo: dadosIniciais.saldo,
        plantoes: [{ ...dadosIniciais.plantoes[0]!, vagasOcupadas: 2 }],
      }),
    );

    render(<PlantoesClient cicloId="ciclo-1" dadosIniciais={dadosIniciais} saldoInicial={saldoInicial} />);
    expect(fetchMock).not.toHaveBeenCalled();

    expect(onEventoCapturado).not.toBeNull();
    onEventoCapturado!();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/plantoes?cicloId=ciclo-1', expect.objectContaining({ method: 'GET' })),
    );
  });
});
