'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/Logo';
import { obterSupabaseBrowser } from '@/lib/supabase/browser-client';

const ITENS_NAV = [
  { href: '/admin', rotulo: 'Painel' },
  { href: '/admin/ciclos', rotulo: 'Ciclos' },
  { href: '/admin/colaboradores', rotulo: 'Colaboradores' },
  { href: '/admin/solicitacoes-cancelamento', rotulo: 'Cancelamentos' },
  { href: '/admin/notificacoes', rotulo: 'Notificações' },
  { href: '/admin/relatorios', rotulo: 'Relatórios' },
  { href: '/admin/auditoria', rotulo: 'Auditoria' },
  { href: '/admin/seguranca', rotulo: 'Segurança' },
  { href: '/admin/configuracoes', rotulo: 'Configurações' },
] as const;

export interface AdminNavProps {
  admin: { email: string | null; nome: string | null };
}

/**
 * Navegação do grupo `/admin` — presente no `layout.tsx` protegido
 * (FE-001.1). Não decide autorização (isso é o guard do layout, no
 * servidor); só apresenta os links e o logout.
 */
export function AdminNav({ admin }: AdminNavProps): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();

  async function sair(): Promise<void> {
    await obterSupabaseBrowser().auth.signOut();
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 p-4">
        <Link href="/admin" aria-label="Ir para o painel administrativo" className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <Logo size={28} />
        </Link>
        <span className="hidden h-6 w-px shrink-0 bg-slate-200 md:block" aria-hidden="true" />
        <nav aria-label="Navegação administrativa" className="flex flex-1 flex-wrap gap-1">
          {ITENS_NAV.map((item) => {
            const ativo = item.href === '/admin' ? pathname === '/admin' : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500',
                  ativo ? 'bg-petrol-600 text-white' : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                {item.rotulo}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>{admin.nome ?? admin.email ?? 'Admin'}</span>
          <Button variant="outline" size="sm" onClick={() => void sair()}>
            Sair
          </Button>
        </div>
      </div>
    </header>
  );
}
