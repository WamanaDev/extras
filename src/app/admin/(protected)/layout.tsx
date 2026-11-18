import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { obterSessaoAdmin } from '@/server/auth/sessao-admin';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

/**
 * Guard de sessão do grupo `/admin/*` (FE-001.1) — todas as rotas dentro de
 * `(protected)` (mesmo path final, o route group não aparece na URL) exigem
 * sessão de admin. Sem sessão → redirect para `/admin/login`, nunca tela
 * branca (FE-001.2).
 *
 * Layout em duas colunas (sidebar + conteúdo) — admin é desktop-first
 * (pedido do usuário), diferente do grupo `(colaborador)`, que é
 * mobile-first com nav própria. `<AdminSidebar />` cuida do próprio
 * responsivo abaixo de `md`.
 */
export default async function AdminProtectedLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  const sessao = await obterSessaoAdmin();
  if (!sessao) {
    redirect('/admin/login');
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AdminSidebar admin={{ email: sessao.email, nome: sessao.nome }} />
      <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
