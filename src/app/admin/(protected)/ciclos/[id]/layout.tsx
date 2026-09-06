'use client';

/**
 * Layout compartilhado de `/admin/ciclos/:id/*` — as abas (Config/Escala/
 * Plantões/Participações/Marcações) viviam só dentro de `page.tsx` (a tela
 * de Config), então sumiam ao navegar pra qualquer outra aba, obrigando o
 * usuário a voltar pra Config toda vez que queria trocar de aba. Movido pra
 * cá (renderiza uma vez, envolve todas as sub-rotas) — pedido do usuário.
 *
 * `print:hidden`: `/escala/imprimir` também é filha desta rota e precisa
 * ficar limpa na impressão (mesma regra de `EscalaImpressao`, `@media
 * print` esconde navegação e controles).
 */
import { use } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface Aba {
  href: string;
  label: string;
}

const ABAS: Aba[] = [
  { href: '', label: 'Config' },
  { href: '/escala', label: 'Escala' },
  { href: '/plantoes', label: 'Plantões' },
  { href: '/participacoes', label: 'Participações' },
  { href: '/marcacoes', label: 'Marcações' },
];

export default function CicloLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}): JSX.Element {
  const { id } = use(params);
  const pathname = usePathname();
  const base = `/admin/ciclos/${id}`;

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 text-sm print:hidden">
        {ABAS.map((aba) => {
          const href = `${base}${aba.href}`;
          const ativo = pathname === href;
          return (
            <Link
              key={aba.href}
              href={href}
              className={cn(
                'border-b-2 px-3 py-2 -mb-px',
                ativo ? 'border-petrol-600 font-medium text-petrol-700' : 'border-transparent text-slate-500 hover:text-slate-900',
              )}
            >
              {aba.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
