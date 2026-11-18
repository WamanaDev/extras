'use client';

/**
 * Cliente Supabase de navegador — usado pelas telas de convite/primeiro
 * acesso (`/admin/definir-senha`, `/admin/primeiro-acesso`) e pelo logout.
 * `@supabase/ssr` sincroniza cookies entre este cliente e o servidor (mesmos
 * nomes de cookie). Sessão aberta aqui (senha) já vale como
 * sessão de admin.
 */
import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/env';

let cliente: ReturnType<typeof createBrowserClient> | null = null;

export function obterSupabaseBrowser(): ReturnType<typeof createBrowserClient> {
  cliente ??= createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return cliente;
}
