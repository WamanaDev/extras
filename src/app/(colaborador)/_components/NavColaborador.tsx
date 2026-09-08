'use client';

/** Navegação persistente do grupo `(colaborador)` — link ativo, logout, dados do ator. */
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { LayoutDashboard, CalendarDays, CalendarRange, ListChecks, LogOut, Users, HeartPulse } from 'lucide-react';
import { post } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { SinoNotificacoes } from '@/components/notificacoes/SinoNotificacoes';
import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';

/**
 * Pedido do usuário: só as versões em calendário ficam no menu — as rotas
 * antigas (`/minha-escala`, `/plantoes`) continuam existindo no código (não
 * foram apagadas), só saíram da navegação. `/minhas-extras` (histórico de
 * extras marcadas/canceladas) não é uma tela de marcação alternativa, então
 * fica de fora dessa troca.
 */
const LINKS = [
  { href: '/painel', rotulo: 'Painel', Icone: LayoutDashboard },
  { href: '/minha-escala-calendario', rotulo: 'Escala', Icone: CalendarDays },
  { href: '/plantoes-calendario', rotulo: 'Extras', Icone: CalendarRange },
  { href: '/minhas-extras', rotulo: 'Minhas extras', Icone: ListChecks },
  // Módulo de pacientes (FUND-005/FE-003) — cuidado com paciente da própria RT.
  { href: '/pacientes', rotulo: 'Pacientes', Icone: Users },
  { href: '/agenda-rt', rotulo: 'Agenda RT', Icone: HeartPulse },
] as const;

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1]?.[0] ?? '' : '';
  return (primeira + ultima).toUpperCase();
}

export function NavColaborador({
  nome,
  matricula,
  rtNome,
}: {
  nome: string;
  matricula: string;
  rtNome: string;
}): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair(): Promise<void> {
    setSaindo(true);
    await post('/api/auth/colaborador/logout');
    router.push('/login');
  }

  return (
    <>
      {/* Topo: identidade do colaborador + sair. Sempre visível, mobile e desktop. */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/painel" aria-label="Ir para o painel" className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              <Logo size={30} withText className="hidden sm:inline-flex" />
              <Logo size={30} withText={false} className="sm:hidden" />
            </Link>
            <span className="hidden h-6 w-px shrink-0 bg-slate-200 sm:block" aria-hidden="true" />
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-petrol-800 to-petrol-600 text-xs font-semibold text-white">
              {iniciais(nome)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{nome}</p>
              <p className="truncate text-xs text-slate-500">
                Matrícula {matricula} · {rtNome}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <SinoNotificacoes />
            <Button variant="outline" size="sm" onClick={() => void sair()} disabled={saindo} aria-busy={saindo}>
              <LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {saindo ? 'Saindo…' : 'Sair'}
            </Button>
          </div>
        </div>

        {/* Navegação em linha, só a partir de `sm` — em telas de celular ela vira a barra fixa abaixo. */}
        <nav aria-label="Navegação do colaborador" className="mx-auto hidden max-w-5xl items-center gap-1 px-4 pb-3 sm:flex">
          {LINKS.map(({ href, rotulo, Icone }) => {
            const ativo = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  ativo ? 'bg-petrol-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                <Icone className="h-4 w-4" aria-hidden="true" />
                {rotulo}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Barra de navegação fixa no rodapé — o padrão mobile-first para o alcance do polegar; some a partir de `sm`. */}
      <nav
        aria-label="Navegação do colaborador"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_8px_rgba(15,23,42,0.06)] backdrop-blur sm:hidden"
      >
        {LINKS.map(({ href, rotulo, Icone }) => {
          const ativo = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativo ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-center text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                ativo ? 'text-petrol-700' : 'text-slate-400',
              )}
            >
              <Icone className={cn('h-5 w-5', ativo && 'text-petrol-700')} aria-hidden="true" />
              {rotulo}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
