import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './page';
import { CHAVE_TOKEN_PARCIAL } from '../_sessao-parcial';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('<LoginPage /> — API-AUTH-001 (matrícula)', () => {
  beforeEach(() => {
    pushMock.mockClear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('envia matrícula, guarda o tokenParcial e vai para /login/pin quando não precisa definir PIN', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { tokenParcial: 'abc.def.ghi', precisaDefinirPin: false, expiraEm: '2026-01-01T00:03:00-03:00' }),
    );

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Matrícula'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login/pin'));

    const [, opcoes] = fetchMock.mock.calls[0]!;
    const corpo = JSON.parse((opcoes as RequestInit).body as string) as { matricula: string };
    expect(corpo.matricula).toBe('12345');

    const guardado = JSON.parse(sessionStorage.getItem(CHAVE_TOKEN_PARCIAL) ?? 'null');
    expect(guardado.tokenParcial).toBe('abc.def.ghi');
  });

  it('redireciona para /login/definir-pin quando a API pede precisaDefinirPin', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { tokenParcial: 'xyz', precisaDefinirPin: true, expiraEm: '2026-01-01T00:03:00-03:00' }),
    );

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Matrícula'), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login/definir-pin'));
  });

  it('mostra a mensagem de erro vinda da API — nunca inventa texto (FE-001.3)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(401, {
        erro: 'CREDENCIAIS_INVALIDAS',
        mensagem: 'Matrícula incorreta.',
        detalhes: null,
        requestId: 'r1',
      }),
    );

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Matrícula'), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Matrícula incorreta.');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('envia a requisição de mutação com X-Requested-With (SEC-INT/CSRF)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { tokenParcial: 'a', precisaDefinirPin: false, expiraEm: 'x' }));

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Matrícula'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, opcoes] = fetchMock.mock.calls[0]!;
    const headers = new Headers((opcoes as RequestInit).headers);
    expect(headers.get('X-Requested-With')).toBe('fetch');
  });
});
