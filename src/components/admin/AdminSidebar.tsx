'use client';

/**
 * Navegação do grupo `/admin` — sidebar lateral, desktop-first (pedido do
 * usuário: a barra horizontal não cabia mais com 10 itens; sidebar escala
 * melhor conforme o admin ganha seções, sem precisar de dropdown escondendo
 * item). Fica de fora do mobile-first do grupo `(colaborador)` de propósito
 * — telas diferentes, decisões de layout diferentes.
 *
 * Não decide autorização (isso é o guard do layout, no servidor); só
 * apresenta os links e o logout.
 */
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarRange,
  Users,
  XCircle,
  Bell,
  BarChart3,
  ScrollText,
  ShieldCheck,
  UserCog,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/Logo';
import { obterSupabaseBrowser } from '@/lib/supabase/browser-client';

const ITENS_NAV = [
  { href: '/admin', rotulo: 'Painel', Icone: LayoutDashboard },
  { href: '/admin/ciclos', rotulo: 'Ciclos', Icone: CalendarRange },
  { href: '/admin/colaboradores', rotulo: 'Colaboradores', Icone: Users },
  { href: '/admin/solicitacoes-cancelamento', rotulo: 'Cancelamentos', Icone: XCircle },
  { href: '/admin/notificacoes', rotulo: 'Notificações', Icone: Bell },
  { href: '/admin/relatorios', rotulo: 'Relatórios', Icone: BarChart3 },
  { href: '/admin/auditoria', rotulo: 'Auditoria', Icone: ScrollText },
  { href: '/admin/seguranca', rotulo: 'Segurança', Icone: ShieldCheck },
  { href: '/admin/administradores', rotulo: 'Administradores', Icone: UserCog },
  { href: '/admin/configuracoes', rotulo: 'Configurações', Icone: Settings },
] as const;

export interface AdminSidebarProps {
  admin: { email: string | null; nome: string | null };
}

export function AdminSidebar({ admin }: AdminSidebarProps): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [abertoNoMobile, setAbertoNoMobile] = useState(false);

  async function sair(): Promise<void> {
    await obterSupabaseBrowser().auth.signOut();
    router.push('/admin/login');
    router.refresh();
  }

  const conteudoNav = (
    <>
      <Link
        href="/admin"
        aria-label="Ir para o painel administrativo"
        className="flex items-center gap-2 rounded-md px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        onClick={() => setAbertoNoMobile(false)}
      >
        <Logo size={26} />
      </Link>

      <nav aria-label="Navegação administrativa" className="mt-6 flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {ITENS_NAV.map(({ href, rotulo, Icone }) => {
          const ativo = href === '/admin' ? pathname === '/admin' : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativo ? 'page' : undefined}
              onClick={() => setAbertoNoMobile(false)}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                ativo ? 'bg-petrol-600 text-white' : 'text-slate-700 hover:bg-slate-100',
              )}
            >
              <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
              {rotulo}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="truncate px-1 text-sm text-slate-600">{admin.nome ?? admin.email ?? 'Admin'}</p>
        <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void sair()}>
          <LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Sair
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop-first: sidebar sempre visível a partir de `md`. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex print:hidden">
        {conteudoNav}
      </aside>

      {/* Abaixo de `md`: barra superior com botão de menu + overlay, não é o foco desta tela (admin é desktop-first), só evita ficar inutilizável num tablet/celular. */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white p-3 md:hidden print:hidden">
        <Link href="/admin" aria-label="Ir para o painel administrativo">
          <Logo size={24} />
        </Link>
        <button
          type="button"
          onClick={() => setAbertoNoMobile(true)}
          aria-label="Abrir menu"
          className="rounded-md p-2 text-slate-700 hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      {abertoNoMobile ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setAbertoNoMobile(false)} aria-hidden="true" />
          <aside className="relative flex w-64 max-w-[85vw] flex-col bg-white p-4 shadow-xl">
            <button
              type="button"
              onClick={() => setAbertoNoMobile(false)}
              aria-label="Fechar menu"
              className="absolute right-3 top-3 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {conteudoNav}
          </aside>
        </div>
      ) : null}
    </>
  );
}
