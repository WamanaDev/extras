import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodigosEscala, type CodigoEscalaLinha } from './CodigosEscala';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const D: CodigoEscalaLinha = { id: 'c1', codigo: 'D', descricao: 'Disponível', presenca: true, ocupaHorario: true, remunerada: true, ativo: true, bloqueado: true, cor: '#2E7D32' };
const ATESTADO: CodigoEscalaLinha = {
  id: 'c2',
  codigo: 'ATESTADO',
  descricao: 'Atestado médico',
  presenca: false,
  ocupaHorario: true,
  remunerada: true,
  ativo: true,
  bloqueado: false,
  cor: '#B71C1C',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CodigosEscala — DOM-003.6 (fixo/bloqueado não edita nem desativa)', () => {
  it('mostra selo "Fixo" para D e não oferece ações para ele', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { itens: [D] }));

    render(<CodigosEscala />);

    await waitFor(() => expect(screen.getByText('D')).toBeInTheDocument());
    expect(screen.getByText('Fixo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar' })).not.toBeInTheDocument();
  });

  it('código não-bloqueado tem botões Editar e Desativar', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { itens: [ATESTADO] }));

    render(<CodigosEscala />);

    await waitFor(() => expect(screen.getByText('ATESTADO')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeInTheDocument();
  });
});

describe('CodigosEscala — cor de código fixo é editável (pedido do usuário)', () => {
  it('código bloqueado (D) ainda tem o seletor de cor, mesmo sem botões de ação', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { itens: [D] }));

    render(<CodigosEscala />);
    await waitFor(() => expect(screen.getByText('D')).toBeInTheDocument());

    expect(screen.getByLabelText('Cor de D')).toBeInTheDocument();
  });

  it('mudar a cor no seletor NÃO manda PATCH sozinho — só ao clicar no ✓ (pedido do usuário: não sobrecarregar o banco)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(200, { itens: [D] }));

    render(<CodigosEscala />);
    await waitFor(() => expect(screen.getByText('D')).toBeInTheDocument());

    const seletorCor = screen.getByLabelText('Cor de D');
    fireEvent.change(seletorCor, { target: { value: '#123456' } });
    fireEvent.change(seletorCor, { target: { value: '#654321' } });
    fireEvent.change(seletorCor, { target: { value: '#111111' } });

    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')).toHaveLength(0);
    expect(screen.getByLabelText('Confirmar cor de D')).toBeInTheDocument();
  });

  it('confirmar a cor pendente (✓) manda um único PATCH só com `cor`', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { itens: [D] }))
      .mockResolvedValueOnce(jsonResponse(200, { ...D, cor: '#123456' }))
      .mockResolvedValueOnce(jsonResponse(200, { itens: [{ ...D, cor: '#123456' }] }));

    render(<CodigosEscala />);
    await waitFor(() => expect(screen.getByText('D')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Cor de D'), { target: { value: '#123456' } });
    await userEvent.click(screen.getByLabelText('Confirmar cor de D'));

    await waitFor(() => {
      const chamadaPatch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
      expect(chamadaPatch).toBeDefined();
    });

    const chamadasPatch = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
    expect(chamadasPatch).toHaveLength(1);
    expect(chamadasPatch[0]![0]).toBe('/api/admin/codigos-escala/c1');
    expect(JSON.parse((chamadasPatch[0]![1] as RequestInit).body as string)).toEqual({ cor: '#123456' });

    // GET responde `Cache-Control: private, max-age=300` — a recarga pós-confirmação
    // precisa ignorar esse cache HTTP, senão a tela continua mostrando a cor antiga até
    // um F5 (achado em uso real: usuário via "Disponível" mudar só depois de recarregar
    // a página; "Folga"/"Férias" pareciam nem aceitar a troca pelo mesmo motivo).
    const chamadasGet = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === undefined || (init as RequestInit | undefined)?.method === 'GET');
    expect(chamadasGet.length).toBeGreaterThanOrEqual(2); // carga inicial + recarga pós-PATCH
    for (const [, init] of chamadasGet) {
      expect((init as RequestInit | undefined)?.cache).toBe('no-store');
    }
  });

  it('cancelar (✕) descarta a cor pendente sem chamar a API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(200, { itens: [D] }));

    render(<CodigosEscala />);
    await waitFor(() => expect(screen.getByText('D')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Cor de D'), { target: { value: '#123456' } });
    await userEvent.click(screen.getByLabelText('Cancelar cor de D'));

    expect(screen.queryByLabelText('Confirmar cor de D')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cor de D')).toHaveValue('#2e7d32');
  });
});

describe('CodigosEscala — cadastro de novo motivo', () => {
  it('cadastra um novo código e recarrega a lista', async () => {
    const usuario = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { itens: [D] })) // carga inicial
      .mockResolvedValueOnce(jsonResponse(200, ATESTADO)) // POST criar
      .mockResolvedValueOnce(jsonResponse(200, { itens: [D, ATESTADO] })); // recarga pós-criação

    render(<CodigosEscala />);
    await waitFor(() => expect(screen.getByText('D')).toBeInTheDocument());

    await usuario.type(screen.getByLabelText('Código'), 'atestado');
    await usuario.type(screen.getByLabelText('Descrição'), 'Atestado médico');
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar motivo' }));

    await waitFor(() => expect(screen.getByText('ATESTADO')).toBeInTheDocument());

    const chamadaPost = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(chamadaPost).toBeDefined();
    const corpo = JSON.parse((chamadaPost![1] as RequestInit).body as string);
    expect(corpo.codigo).toBe('atestado');
    expect(corpo).not.toHaveProperty('bloqueado');
  });

  it('erro de negócio (código duplicado) aparece inline, não trava a lista', async () => {
    const usuario = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { itens: [D] }))
      .mockResolvedValueOnce(jsonResponse(409, { erro: 'REGRA_DE_NEGOCIO', mensagem: 'Já existe um código "D" cadastrado.', detalhes: null, requestId: 'r1' }));

    render(<CodigosEscala />);
    await waitFor(() => expect(screen.getByText('D')).toBeInTheDocument());

    await usuario.type(screen.getByLabelText('Código'), 'D');
    await usuario.type(screen.getByLabelText('Descrição'), 'Duplicado');
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar motivo' }));

    await waitFor(() => expect(screen.getByText('Já existe um código "D" cadastrado.')).toBeInTheDocument());
  });
});
