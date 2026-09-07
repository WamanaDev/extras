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
      cancelamentoPendente: false,
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
      cancelamentoPendente: false,
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

  it('marcação com cancelamento pendente mostra o badge, nunca o botão (pedido do usuário)', () => {
    const dados: MinhasMarcacoesDados = {
      ...dadosBase,
      marcacoes: [{ ...dadosBase.marcacoes[0]!, podeCancelar: false, cancelamentoPendente: true }, dadosBase.marcacoes[1]!],
    };
    render(<MinhasExtrasClient cicloId="ciclo-1" dadosIniciais={dados} />);
    expect(screen.getByText('Cancelamento em análise')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^cancelar$/i })).not.toBeInTheDocument();
  });

  it('pedido de cancelamento exige motivo preenchido antes de enviar — DELETE só depois, com o motivo no corpo', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(<MinhasExtrasClient cicloId="ciclo-1" dadosIniciais={dadosBase} />);

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    const dialogo = await screen.findByRole('dialog', { hidden: true });
    expect(dialogo).toHaveTextContent('2026-01-10');
    const enviar = screen.getByRole('button', { name: /enviar pedido/i });
    expect(enviar).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/motivo do cancelamento/i), { target: { value: 'Imprevisto pessoal' } });
    expect(enviar).toBeEnabled();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'sol-1', marcacaoId: 'm1', status: 'PENDENTE', jaExistia: false }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        marcacoes: [{ ...dadosBase.marcacoes[0]!, podeCancelar: false, cancelamentoPendente: true }, dadosBase.marcacoes[1]!],
        totais: { confirmadas: 1, canceladas: 1, horas: 12 },
      }),
    );

    fireEvent.click(enviar);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/marcacoes/m1',
        expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ motivo: 'Imprevisto pessoal' }) }),
      ),
    );
    expect(await screen.findByText(/pedido de cancelamento enviado/i)).toBeInTheDocument();
  });

  it('erro de negócio no pedido (409) fica inline, não fecha o modal silenciosamente (FE-001.4)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(409, { erro: 'REGRA_DE_NEGOCIO', mensagem: 'Este ciclo já está fechado — não é possível pedir cancelamento.', detalhes: null, requestId: 'r' }),
    );

    render(<MinhasExtrasClient cicloId="ciclo-1" dadosIniciais={dadosBase} />);
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    fireEvent.change(screen.getByLabelText(/motivo do cancelamento/i), { target: { value: 'Imprevisto pessoal' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar pedido/i }));

    expect(await screen.findByText('Este ciclo já está fechado — não é possível pedir cancelamento.')).toBeInTheDocument();
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
