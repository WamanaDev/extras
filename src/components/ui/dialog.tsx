import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Modal acessível sobre `<dialog>` nativo — foco preso pelo próprio
 * navegador, `Esc` fecha, sem dependência de Radix (não presente no
 * projeto). Usado por `ConfirmacaoImpacto`.
 */
export function Dialog({
  aberto,
  onFechar,
  titulo,
  children,
  className,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (aberto && !el.open) el.showModal();
    if (!aberto && el.open) el.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-titulo"
      className={cn('rounded-lg border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/50', className)}
      onClose={onFechar}
      onCancel={onFechar}
    >
      <div className="w-full max-w-lg p-6">
        <h2 id="dialog-titulo" className="text-lg font-semibold text-slate-900">
          {titulo}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}
