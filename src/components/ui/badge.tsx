import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'border-transparent bg-slate-900 text-white',
      secondary: 'border-transparent bg-slate-100 text-slate-900',
      outline: 'border-slate-400 text-slate-900',
      warning: 'border-transparent bg-amber-100 text-amber-900',
      destructive: 'border-transparent bg-red-100 text-red-900',
      success: 'border-transparent bg-emerald-100 text-emerald-900',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
