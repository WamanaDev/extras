import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DefinirPinPage from './page';
import { CHAVE_TOKEN_PARCIAL } from '../_sessao-parcial';

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function guardarToken(): void {
  sessionStorage.setItem(
    CHAVE_TOKEN_PARCIAL,
    JSON.stringify({ tokenParcial: 'token-parcial', expiraEm: '2026-01-01T00:03:00-03:00' }),
  );
}

describe('<DefinirPinPage /> — API-AUTH-003', () => {
  beforeEach(() => {
    pushMock.mockClear();
    replaceMock.mockClear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redireciona para /login sem tokenParcial guardado', async () => {
    render(<DefinirPinPage />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
  });

  it('caminho feliz: define o PIN, cria sessão e vai para /painel', async () => {
    guardarToken();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        colaborador: { id: '1', nome: 'Fulana', matricula: '123', rt: { codigo: 'A', nome: 'RT A' } },
        expiraEm: '2026-01-01T08:00:00-03:00',
      }),
    );

    render(<DefinirPinPage />);
    fireEvent.change(await screen.findByLabelText('Novo PIN'), { target: { value: '5678' } });
    fireEvent.change(screen.getByLabelText('Confirme o PIN'), { target: { value: '5678' } });
    fireEvent.click(screen.getByRole('button', { name: /definir pin e entrar/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/painel'));
    expect(sessionStorage.getItem(CHAVE_TOKEN_PARCIAL)).toBeNull();

    const [, opcoes] = fetchMock.mock.calls[0]!;
    const corpo = JSON.parse((opcoes as RequestInit).body as string) as {
      tokenParcial: string;
      pin: string;
      confirmacao: string;
    };
    expect(corpo).toEqual({ tokenParcial: 'token-parcial', pin: '5678', confirmacao: '5678' });
  });

  it('PIN_FRACO (RN-30) aparece inline — a regra é sempre validada no servidor (FE-001.5)', async () => {
    guardarToken();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(422, { erro: 'PIN_FRACO', mensagem: 'Esse PIN é fácil demais de adivinhar.', detalhes: null, requestId: 'r' }),
    );

    render(<DefinirPinPage />);
    fireEvent.change(await screen.findByLabelText('Novo PIN'), { target: { value: '1234' } });
    fireEvent.change(screen.getByLabelText('Confirme o PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /definir pin e entrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Esse PIN é fácil demais de adivinhar.');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('PIN_JA_DEFINIDO redireciona para /login/pin', async () => {
    guardarToken();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(409, { erro: 'PIN_JA_DEFINIDO', mensagem: 'PIN já definido.', detalhes: null, requestId: 'r' }),
    );

    render(<DefinirPinPage />);
    fireEvent.change(await screen.findByLabelText('Novo PIN'), { target: { value: '5678' } });
    fireEvent.change(screen.getByLabelText('Confirme o PIN'), { target: { value: '5678' } });
    fireEvent.click(screen.getByRole('button', { name: /definir pin e entrar/i }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login/pin'));
  });
});
