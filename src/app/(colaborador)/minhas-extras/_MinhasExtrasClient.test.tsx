import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MinhasExtrasClient, type MinhasMarcacoesDados } from './_MinhasExtrasClient';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const dadosBase: MinhasMarcacoesDados = {
  marcacoes: [
    {
      id: 'm1',
      data: '2026-01-10',
      tipo: 'DIURNO',
      rt: 'RT A',
      horaInicio: '07:00',
      horaFim: '19:00',
      status: 'CONFIRMADA',
      cruzada: false,
      criadoEm: '2026-01-01T00:00:00-03:00',
      canceladoEm: null,
      podeCancelar: true,
    },
    {
      id: 'm2',
      data: '2026-01-02',
      tipo: 'NOTURNO',
      rt: 'RT B',
      horaInicio: '19:00',
      horaFim: '07:00',
      status: 'CANCELADA',
      cruzada: false,
      criadoEm: '2026-01-01T00:00:00-03:00',
      canceladoEm: '2026-01-01T10:00:00-03:00',
      podeCancelar: false,
    },
  ],
  totais: { confirmadas: 1, canceladas: 1, horas: 12 },
};

describe('<MinhasExtrasClient /> — API-COL-005/006', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lista as marcações com dados iniciais, sem precisar buscar de novo', () => {
    render(<MinhasExtrasClient cicloId="ciclo-1" dadosIniciais={dadosBase} />);

    expect(screen.getByText(/2026-01-10/)).toBeInTheDocument();
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
  });

  it('só mostra "Cancelar" quando podeCancelar vem true da API (FE-001.5)', () => {
    render(<MinhasExtrasClient cicloId="ciclo-1" dadosIniciais={dadosBase} />);
    expect(screen.getAllByRole('button', { name: /cancelar/i })).toHaveLength(1);
  });

  it('cancelamento exige confirmação com o impacto listado antes do DELETE (FE-001.6)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(<MinhasExtrasClient cicloId="ciclo-1" dadosIniciais={dadosBase} />);

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    const dialogo = await screen.findByRole('dialog', { hidden: true });
    expect(dialogo).toHaveTextContent('2026-01-10');
    const confirmar = screen.getByRole('button', { name: /confirmar mesmo assim/i });
    expect(confirmar).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: /li e entendo/i }));
    expect(confirmar).toBeEnabled();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'm1', status: 'CANCELADA' }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        marcacoes: [{ ...dadosBase.marcacoes[0]!, status: 'CANCELADA', podeCancelar: false }, dadosBase.marcacoes[1]!],
        totais: { confirmadas: 0, canceladas: 2, horas: 12 },
      }),
    );

    fireEvent.click(confirmar);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/marcacoes/m1', expect.objectContaining({ method: 'DELETE' })));
  });

  it('erro de negócio no cancelamento (409) fica inline, não fecha o modal silenciosamente (FE-001.4)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(409, { erro: 'JANELA_ENCERRADA', mensagem: 'A janela deste ciclo já encerrou.', detalhes: null, requestId: 'r' }),
    );

    render(<MinhasExtrasClient cicloId="ciclo-1" dadosIniciais={dadosBase} />);
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /li e entendo/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar mesmo assim/i }));

    expect(await screen.findByText('A janela deste ciclo já encerrou.')).toBeInTheDocument();
  });

  it('estado vazio quando não há marcações', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { marcacoes: [], totais: { confirmadas: 0, canceladas: 0, horas: 0 } }));
    render(<MinhasExtrasClient cicloId="ciclo-1" />);
    expect(await screen.findByText(/ainda não marcou nenhuma extra/i)).toBeInTheDocument();
  });

  it('estado de erro de carga mostra a mensagem da API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { erro: 'ERRO_INTERNO', mensagem: 'Falha ao carregar suas extras.', detalhes: null, requestId: 'r' }),
    );
    render(<MinhasExtrasClient cicloId="ciclo-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar suas extras.');
  });
});
