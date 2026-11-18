/**
 * Sessão de admin — leitura única usada pelos dois guardas:
 * - `resolverSessaoAdmin` (`src/server/http/handler.ts`), para as rotas de API;
 * - `obterSessaoAdmin` (abaixo), para o layout do grupo `/admin/*`
 *   (FE-001.1), que roda em Server Component fora de `defineHandler`.
 *
 * Uma sessão de admin vale quando há sessão válida no Supabase Auth
 * (`auth.getUser()` valida o token no servidor) — nada além disso, pois o
 * login é só e-mail + senha (`_conflitos.md`).
 *
 * Só leitura de cookie (`setAll: () => {}`) — refresh de sessão é
 * responsabilidade do fluxo de login, não do guard.
 */
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/env';

export interface SessaoAdmin {
  id: string;
  email: string | null;
  nome: string | null;
}

export interface CookieSimples {
  name: string;
  value: string;
}

export function nomeDoUserMetadata(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.nome === 'string') return m.nome;
  if (typeof m.full_name === 'string') return m.full_name;
  return null;
}

/** Lê a sessão do Supabase a partir dos cookies da requisição, ou `null`. */
export async function lerSessaoAdmin(cookiesDaRequisicao: CookieSimples[]): Promise<SessaoAdmin | null> {
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookiesDaRequisicao,
      setAll: () => {},
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, nome: nomeDoUserMetadata(data.user.user_metadata) };
}

/** Para Server Components / rotas: lê os cookies da requisição atual via `next/headers`. */
export async function obterSessaoAdmin(): Promise<SessaoAdmin | null> {
  const cookieStore = await cookies();
  return lerSessaoAdmin(cookieStore.getAll().map((c) => ({ name: c.name, value: c.value })));
}
