import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tooltip acessível sem dependência externa: usa `aria-describedby` + um
 * `<span>` visualmente oculto até o foco/hover (via `title` nativo também,
 * para leitores que não processam `aria-describedby` em hover). Texto vem
 * sempre de quem chama — nunca inventado aqui (FE-001.5 no caso de
 * `GradePlantoes`).
 */
export function TextoComDica({
  texto,
  dica,
  className,
}: {
  texto: ReactNode;
  dica: string;
  className?: string;
}): JSX.Element {
  const id = useId();
  return (
    <span className={cn('relative inline-flex items-center gap-1', className)} title={dica}>
      <span aria-describedby={id}>{texto}</span>
      <span id={id} role="tooltip" className="sr-only">
        {dica}
      </span>
    </span>
  );
}
