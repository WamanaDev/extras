/**
 * Guard de sessão para o grupo `/admin/*` (FE-001.1).
 *
 * Mesma leitura somente-leitura de cookie que `resolverSessaoAdmin`
 * (`src/server/http/handler.ts`) usa para autorizar as rotas de API —
 * reimplementada aqui (não exportada de `handler.ts`) para uso em Server
 * Components (`layout.tsx` do grupo protegido), que rodam fora do pipeline
 * de `defineHandler`. Nunca escreve cookie de volta (`setAll: () => {}`) —
 * refresh de sessão de admin é responsabilidade do fluxo de login
 * (`API-AUTH-006`), não deste guard.
 */
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/env';

export interface SessaoAdmin {
  id: string;
  email: string | null;
  nome: string | null;
}

export async function obterSessaoAdmin(): Promise<SessaoAdmin | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll().map((c) => ({ name: c.name, value: c.value })),
      setAll: () => {},
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const metadata = data.user.user_metadata as Record<string, unknown> | undefined;
  const nome =
    typeof metadata?.nome === 'string'
      ? metadata.nome
      : typeof metadata?.full_name === 'string'
        ? (metadata.full_name as string)
        : null;

  return { id: data.user.id, email: data.user.email ?? null, nome };
}
