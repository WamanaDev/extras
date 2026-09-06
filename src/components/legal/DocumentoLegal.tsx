/**
 * Layout compartilhado dos documentos legais (`/privacidade`, `/termos`) —
 * tipografia simples via utilitários Tailwind (não há plugin de typography
 * instalado, `tailwind.config.ts` não lista nenhum) e âncoras de seção pra
 * navegação interna.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';

export function DocumentoLegal({
  titulo,
  atualizadoEm,
  children,
}: {
  titulo: string;
  atualizadoEm: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <Logo size={28} />
          </Link>
          <nav className="flex gap-4 text-sm text-slate-600">
            <Link href="/privacidade" className="hover:text-petrol-700 hover:underline">
              Privacidade
            </Link>
            <Link href="/termos" className="hover:text-petrol-700 hover:underline">
              Termos de uso
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">{titulo}</h1>
        <p className="mt-1 text-sm text-slate-500">Última atualização: {atualizadoEm}</p>

        <div className="prose-legal mt-8 space-y-8">{children}</div>
      </main>
    </div>
  );
}

export function Secao({ titulo, id, children }: { titulo: string; id: string; children: ReactNode }): JSX.Element {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-lg font-semibold text-petrol-800">{titulo}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export function Aviso({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">{children}</div>
  );
}
