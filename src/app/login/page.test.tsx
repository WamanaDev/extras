import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './page';

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('<LoginPage /> — login rápido (matrícula+PIN, _conflitos.md item 33)', () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('envia matrícula e PIN, e vai para /painel em caso de sucesso', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        colaborador: { id: 'c1', nome: 'Ana', matricula: '12345', rt: { codigo: 'RT1', nome: 'RT1' } },
        expiraEm: '2026-01-01T08:00:00-03:00',
      }),
    );

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Matrícula'), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/painel'));

    const [caminho, opcoes] = fetchMock.mock.calls[0]!;
    expect(caminho).toBe('/api/auth/colaborador/login-rapido');
    const corpo = JSON.parse((opcoes as RequestInit).body as string) as { matricula: string; pin: string };
    expect(corpo.matricula).toBe('12345');
    expect(corpo.pin).toBe('1234');
  });

  it('mostra a mensagem de erro vinda da API — nunca inventa texto (FE-001.3)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(401, { erro: 'CREDENCIAIS_INVALIDAS', mensagem: 'Matrícula ou PIN incorretos.', detalhes: null, requestId: 'r1' }),
    );

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Matrícula'), { target: { value: '999' } });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '0000' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Matrícula ou PIN incorretos.');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('envia a requisição de mutação com X-Requested-With (SEC-INT/CSRF)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { colaborador: { id: 'c1', nome: 'A', matricula: '1', rt: { codigo: 'R', nome: 'R' } }, expiraEm: 'x' }),
    );

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Matrícula'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, opcoes] = fetchMock.mock.calls[0]!;
    const headers = new Headers((opcoes as RequestInit).headers);
    expect(headers.get('X-Requested-With')).toBe('fetch');
  });

  it('nunca guarda PIN em sessionStorage/localStorage (FE-001.8)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { colaborador: { id: 'c1', nome: 'A', matricula: '1', rt: { codigo: 'R', nome: 'R' } }, expiraEm: 'x' }),
    );

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Matrícula'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    for (let i = 0; i < sessionStorage.length; i++) {
      const chave = sessionStorage.key(i)!;
      expect(sessionStorage.getItem(chave)).not.toContain('1234');
    }
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i)!;
      expect(localStorage.getItem(chave)).not.toContain('1234');
    }
  });

  it('tem link para /login/matricula (primeiro acesso / esqueci o PIN)', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, {}));
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: /primeiro acesso ou esqueci o pin/i });
    expect(link).toHaveAttribute('href', '/login/matricula');
  });
});
