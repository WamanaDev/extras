/**
 * Cliente Supabase com a service role key — só pra Admin API
 * (`auth.admin.*`: convidar, listar, revogar). Admin não tem tabela própria
 * no Prisma (`FUND-003`, "Auth admin: Supabase Auth + MFA" — ver
 * `prisma/seed.ts`, `seedAdminInicial`, mesmo padrão que este módulo
 * reaproveita em vez de duplicar `createClient` ad hoc). Singleton por
 * processo, mesmo racional de `src/server/realtime/broadcast.ts`.
 *
 * Nunca exposto ao browser (service role ignora RLS por completo) — só
 * importado por rotas `ator: 'ADMIN'` do lado do servidor.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env';

let clienteSingleton: SupabaseClient | null = null;

export function obterSupabaseAdmin(): SupabaseClient {
  clienteSingleton ??= createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return clienteSingleton;
}
