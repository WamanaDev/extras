'use client';

/**
 * Cliente Supabase de navegador — usado só pela etapa de MFA de
 * `/admin/login` (`API-AUTH-006`). O passo de verificação do desafio MFA é
 * "fora do escopo" da rota `POST /api/auth/admin/login`
 * (`src/server/auth/admin-login.ts`, doc-comment do módulo): o cliente
 * completa via SDK do Supabase diretamente. `@supabase/ssr` sincroniza
 * cookies entre este cliente e o servidor (mesmos nomes de cookie), então a
 * sessão elevada a `aal2` aqui é a mesma que `obterSessaoAdmin` (guard do
 * layout) e `resolverSessaoAdmin` (API) leem depois.
 */
import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/env';

let cliente: ReturnType<typeof createBrowserClient> | null = null;

export function obterSupabaseBrowser(): ReturnType<typeof createBrowserClient> {
  cliente ??= createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return cliente;
}
