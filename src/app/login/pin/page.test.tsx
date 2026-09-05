import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPinPage from './page';
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

describe('<LoginPinPage /> — API-AUTH-002', () => {
  beforeEach(() => {
    pushMock.mockClear();
    replaceMock.mockClear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redireciona para /login quando não há tokenParcial guardado (nunca mostra um formulário que só pode falhar)', async () => {
    render(<LoginPinPage />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
  });

  it('caminho feliz: envia o PIN, limpa o token e vai para /painel', async () => {
    guardarToken();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        colaborador: { id: '1', nome: 'Fulana', matricula: '123', rt: { codigo: 'A', nome: 'RT A' } },
        expiraEm: '2026-01-01T08:00:00-03:00',
      }),
    );

    render(<LoginPinPage />);
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/painel'));
    expect(sessionStorage.getItem(CHAVE_TOKEN_PARCIAL)).toBeNull();

    const [, opcoes] = fetchMock.mock.calls[0]!;
    const corpo = JSON.parse((opcoes as RequestInit).body as string) as { tokenParcial: string; pin: string };
    expect(corpo.tokenParcial).toBe('token-parcial');
    expect(corpo.pin).toBe('1234');
  });

  it('PIN_NAO_DEFINIDO redireciona para /login/definir-pin', async () => {
    guardarToken();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(409, { erro: 'PIN_NAO_DEFINIDO', mensagem: 'Defina seu PIN.', detalhes: null, requestId: 'r' }),
    );

    render(<LoginPinPage />);
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login/definir-pin'));
  });

  it('TOKEN_INVALIDO limpa o token e volta para /login', async () => {
    guardarToken();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(401, { erro: 'TOKEN_INVALIDO', mensagem: 'Sessão expirada.', detalhes: null, requestId: 'r' }),
    );

    render(<LoginPinPage />);
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(sessionStorage.getItem(CHAVE_TOKEN_PARCIAL)).toBeNull();
  });

  it('CREDENCIAIS_INVALIDAS mostra a mensagem da API inline, sem navegar (FE-001.3/FE-001.4)', async () => {
    guardarToken();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(401, { erro: 'CREDENCIAIS_INVALIDAS', mensagem: 'PIN incorreto.', detalhes: null, requestId: 'r' }),
    );

    render(<LoginPinPage />);
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '9999' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('PIN incorreto.');
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledTimes(0);
  });
});
