import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GradePlantoes, type GradePlantoesDados } from './GradePlantoes';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function construirDados(overrides: Partial<GradePlantoesDados['plantoes'][number]>): GradePlantoesDados {
  return {
    saldo: { limite: 4, usadas: 1, restantes: 3, permiteCruzada: true },
    plantoes: [
      {
        id: 'plantao-1',
        data: '2026-09-10',
        tipo: 'DIURNO',
        rt: 'RT-1',
        horaInicio: '07:00',
        horaFim: '19:00',
        vagasTotais: 2,
        vagasOcupadas: 2,
        jaMarcado: false,
        disponivel: false,
        motivo: 'SEM_VAGA',
        ...overrides,
      },
    ],
  };
}

describe('GradePlantoes — FE-3 (tooltip de bloqueio vem da API)', () => {
  it('exibe o texto de motivo exatamente como veio da API, via title/tooltip', () => {
    const dados = construirDados({ motivo: 'EXCEDE_JORNADA', disponivel: false });
    render(<GradePlantoes cicloId="ciclo-1" dadosIniciais={dados} />);

    const card = screen.getByTestId('plantao-plantao-1');
    // O componente não decide o motivo — só repassa `motivo` da API no atributo de dados e no tooltip.
    expect(card).toHaveAttribute('data-motivo', 'EXCEDE_JORNADA');
    const gatilho = screen.getByText('Indisponível').closest('[title]');
    expect(gatilho).toHaveAttribute('title', expect.stringMatching(/jornada/i));
  });
});

describe('GradePlantoes — FE-5 (SEM_VAGA é inline, não toast)', () => {
  it('mostra SEM_VAGA como texto no lugar da ação, nunca um alerta global de erro', () => {
    const dados = construirDados({ motivo: 'SEM_VAGA', disponivel: false });
    render(<GradePlantoes cicloId="ciclo-1" dadosIniciais={dados} />);

    // Aparece como rótulo do próprio botão desabilitado — inline — e não existe nenhum role="alert" na tela.
    expect(screen.getByText('Sem vaga')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('quando a marcação é recusada pela API com SEM_VAGA, o erro aparece dentro do card, não como toast', async () => {
    const usuario = userEvent.setup();
    const dados = construirDados({ id: 'plantao-2', motivo: null, disponivel: true, vagasOcupadas: 1 });

    const respostaFetch = {
      ok: false,
      status: 409,
      json: async () => ({
        erro: 'SEM_VAGA',
        mensagem: 'Não há mais vagas disponíveis para este plantão.',
        detalhes: null,
        requestId: 'req-1',
      }),
      text: async () =>
        JSON.stringify({
          erro: 'SEM_VAGA',
          mensagem: 'Não há mais vagas disponíveis para este plantão.',
          detalhes: null,
          requestId: 'req-1',
        }),
    } as unknown as Response;

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaFetch);

    render(<GradePlantoes cicloId="ciclo-1" dadosIniciais={dados} />);
    await usuario.click(screen.getByRole('button', { name: 'Marcar extra' }));

    await waitFor(() => {
      expect(screen.getByText('Não há mais vagas disponíveis para este plantão.')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fetchMock.mockRestore();
  });
});

describe('GradePlantoes — FE-001.5 (não decide bloqueio no cliente)', () => {
  const cenariosExibidos: Array<GradePlantoesDados['plantoes'][number]['motivo']> = [
    'JA_MARCADO',
    'EM_AUSENCIA',
    'EXCEDE_JORNADA',
    'LIMITE_ATINGIDO',
    'SEM_VAGA',
  ];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const motivo of cenariosExibidos) {
    it(`repassa motivo=${motivo} sem recalcular`, () => {
      const dados = construirDados({ motivo, disponivel: false, id: `plantao-${motivo}` });
      render(<GradePlantoes cicloId="ciclo-1" dadosIniciais={dados} />);
      const card = screen.getByTestId(`plantao-plantao-${motivo}`);
      expect(card).toHaveAttribute('data-motivo', motivo);
    });
  }
});

describe('GradePlantoes — ocultação por pedido do usuário (CRUZADA_BLOQUEADA/CONFLITO_DE_HORARIO nunca aparecem)', () => {
  const cenariosOcultos: Array<GradePlantoesDados['plantoes'][number]['motivo']> = ['CRUZADA_BLOQUEADA', 'CONFLITO_DE_HORARIO'];

  for (const motivo of cenariosOcultos) {
    it(`não renderiza nenhum card para motivo=${motivo}`, () => {
      const dados = construirDados({ motivo, disponivel: false, id: `plantao-${motivo}` });
      render(<GradePlantoes cicloId="ciclo-1" dadosIniciais={dados} />);
      expect(screen.queryByTestId(`plantao-plantao-${motivo}`)).not.toBeInTheDocument();
      expect(screen.getByText('Nenhum plantão de extra disponível neste ciclo.')).toBeInTheDocument();
    });
  }

  it('esconde só os plantões ocultos, mantendo os demais visíveis na mesma grade', () => {
    const dados: GradePlantoesDados = {
      saldo: { limite: 4, usadas: 1, restantes: 3, permiteCruzada: true },
      plantoes: [
        { id: 'p-oculto', data: '2026-09-10', tipo: 'DIURNO', rt: 'RT-2', horaInicio: '07:00', horaFim: '19:00', vagasTotais: 2, vagasOcupadas: 1, jaMarcado: false, disponivel: false, motivo: 'CRUZADA_BLOQUEADA' },
        { id: 'p-visivel', data: '2026-09-11', tipo: 'DIURNO', rt: 'RT-1', horaInicio: '07:00', horaFim: '19:00', vagasTotais: 2, vagasOcupadas: 0, jaMarcado: false, disponivel: true, motivo: null },
      ],
    };
    render(<GradePlantoes cicloId="ciclo-1" dadosIniciais={dados} />);
    expect(screen.queryByTestId('plantao-p-oculto')).not.toBeInTheDocument();
    expect(screen.getByTestId('plantao-p-visivel')).toBeInTheDocument();
  });
});

describe('GradePlantoes — revalidação via `revalidarChave` nunca desmonta (achado em uso real de Realtime)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ao mudar revalidarChave, refaz o fetch em segundo plano sem mostrar "Carregando…" de novo', async () => {
    const dadosIniciais = construirDados({ motivo: null, disponivel: true, id: 'p1', vagasOcupadas: 0 });
    const dadosAtualizados = construirDados({ motivo: null, disponivel: true, id: 'p1', vagasOcupadas: 1 });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, dadosAtualizados));

    const { rerender } = render(<GradePlantoes cicloId="ciclo-1" dadosIniciais={dadosIniciais} revalidarChave={0} />);

    // Dado inicial já na tela — nenhuma busca disparada ainda (SSR já trouxe).
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('plantao-p1')).toBeInTheDocument();

    rerender(<GradePlantoes cicloId="ciclo-1" dadosIniciais={dadosIniciais} revalidarChave={1} />);

    // Nunca aparece o estado de carregamento — a grade antiga fica na tela até a resposta nova chegar.
    expect(screen.queryByText('Carregando plantões disponíveis…')).not.toBeInTheDocument();
    expect(screen.getByTestId('plantao-p1')).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('plantao-p1')).toHaveTextContent('1/2'));
    expect(screen.queryByText('Carregando plantões disponíveis…')).not.toBeInTheDocument();
  });
});
