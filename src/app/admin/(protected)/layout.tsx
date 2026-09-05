import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { obterSessaoAdmin } from '@/server/auth/sessao-admin';
import { AdminNav } from '@/components/admin/AdminNav';

/**
 * Guard de sessão do grupo `/admin/*` (FE-001.1) — todas as rotas dentro de
 * `(protected)` (mesmo path final, o route group não aparece na URL) exigem
 * sessão de admin. Sem sessão → redirect para `/admin/login`, nunca tela
 * branca (FE-001.2).
 */
export default async function AdminProtectedLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  const sessao = await obterSessaoAdmin();
  if (!sessao) {
    redirect('/admin/login');
  }

  return (
    <div className="min-h-screen">
      <AdminNav admin={{ email: sessao.email, nome: sessao.nome }} />
      <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
