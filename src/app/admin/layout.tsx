import type { ReactNode } from 'react';

/**
 * Layout raso do grupo `/admin` — envolve tanto `/admin/login` (público)
 * quanto o grupo protegido `(protected)` (guard em
 * `src/app/admin/(protected)/layout.tsx`, FE-001.1). Não decide sessão aqui:
 * colocar o guard neste nível redirecionaria `/admin/login` para si mesmo.
 */
export default function AdminLayout({ children }: { children: ReactNode }): JSX.Element {
  return <div className="min-h-screen bg-slate-50 text-slate-900">{children}</div>;
}
