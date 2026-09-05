import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const getServidorMock = vi.fn();
vi.mock('@/lib/api/servidor', () => ({ getServidor: (...args: unknown[]) => getServidorMock(...args) }));

class RedirectSinalizado extends Error {
  constructor(public destino: string) {
    super('NEXT_REDIRECT');
  }
}
const redirectMock = vi.fn((destino: string) => {
  throw new RedirectSinalizado(destino);
});
vi.mock('next/navigation', () => ({
  redirect: (destino: string) => redirectMock(destino),
  usePathname: () => '/painel',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('(colaborador)/layout.tsx — guard de sessão (FE-001.1)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('redireciona para /login quando GET /api/auth/me falha (sem sessão)', async () => {
    getServidorMock.mockResolvedValue({ ok: false, status: 401, erro: { erro: 'NAO_AUTENTICADO', mensagem: 'x', detalhes: null, requestId: 'r' } });

    const { default: ColaboradorLayout } = await import('./layout');

    await expect(ColaboradorLayout({ children: <div>conteúdo</div> })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('redireciona para /login quando a sessão é de admin, não de colaborador', async () => {
    getServidorMock.mockResolvedValue({ ok: true, status: 200, dados: { tipo: 'ADMIN', admin: { id: 'a1', email: 'a@x.com', nome: 'Admin' } } });

    const { default: ColaboradorLayout } = await import('./layout');

    await expect(ColaboradorLayout({ children: <div>conteúdo</div> })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('renderiza a navegação e o conteúdo quando a sessão é de colaborador válida', async () => {
    // `<SinoNotificacoes />` (renderizado pela nav) busca `/api/notificacoes`
    // ao montar — stub aqui, mesmo padrão de `GradePlantoes.test.tsx`.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { itens: [], total: 0 }));

    getServidorMock.mockResolvedValue({
      ok: true,
      status: 200,
      dados: {
        tipo: 'COLABORADOR',
        colaborador: { id: 'c1', nome: 'Fulana', matricula: '123', rt: { codigo: 'A', nome: 'RT A' } },
        expiraEm: '2026-01-01T08:00:00-03:00',
      },
    });

    const { default: ColaboradorLayout } = await import('./layout');
    const elemento = await ColaboradorLayout({ children: <div>conteúdo da página</div> });
    render(elemento);

    expect(screen.getByText('Fulana')).toBeInTheDocument();
    expect(screen.getByText('conteúdo da página')).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
