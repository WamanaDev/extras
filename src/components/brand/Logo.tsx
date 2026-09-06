/**
 * Marca do Extrinha (mesmo desenho de `public/brand/mark.svg` /
 * `public/favicon.svg`, reimplementado como SVG inline para ficar nítido em
 * qualquer tamanho sem depender de um `<img>`) — badge coral com um "+" e um
 * pingo, opcionalmente acompanhado do nome por extenso.
 */
import { cn } from "@/lib/utils";

export function LogoMark({ size = 32, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Extrinha"
    >
      <defs>
        <linearGradient id="extrinha-mark-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF6B4D" />
          <stop offset="1" stopColor="#E8532F" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22.5" fill="url(#extrinha-mark-bg)" />
      <rect x="42.25" y="24" width="15.5" height="54" rx="7.75" fill="#FFF8F3" />
      <rect x="24" y="42.25" width="46" height="15.5" rx="7.75" fill="#FFF8F3" />
      <circle cx="50" cy="20.5" r="7.5" fill="#0B4F4A" />
    </svg>
  );
}

export function Logo({
  size = 32,
  withText = true,
  className,
  textClassName,
}: {
  size?: number;
  withText?: boolean;
  className?: string;
  textClassName?: string;
}): JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      {withText ? (
        <span className={cn("text-lg font-semibold tracking-tight text-petrol-800", textClassName)}>extrinha</span>
      ) : null}
    </span>
  );
}
