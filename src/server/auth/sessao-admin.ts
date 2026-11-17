/**
 * Sessão de admin — leitura única usada pelos dois guardas:
 * - `resolverSessaoAdmin` (`src/server/http/handler.ts`), para as rotas de API;
 * - `obterEstadoSessaoAdmin` (abaixo), para o layout do grupo `/admin/*`
 *   (FE-001.1), que roda em Server Component fora de `defineHandler`.
 *
 * Uma sessão de admin só vale quando as duas coisas existem: a sessão do
 * Supabase Auth (senha) **e** o cookie `admin_2fa` do segundo fator por
 * WhatsApp, assinado para o mesmo usuário e o mesmo `session_id` (ver
 * `./segundo-fator.ts`). Sessão do Supabase sem `admin_2fa` válido é
 * `PENDENTE_2FA` — o layout manda pra `/admin/verificar`, a API responde
 * `401`.
 *
 * Só leitura de cookie (`setAll: () => {}`) — refresh de sessão é
 * responsabilidade do fluxo de login, não do guard.
 */
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/env';
import {
  NOME_COOKIE_SEGUNDO_FATOR,
  cookieSegundoFatorValido,
  sessionIdDoAccessToken,
  whatsappDoAppMetadata,
} from './segundo-fator';

export interface SessaoAdmin {
  id: string;
  email: string | null;
  nome: string | null;
}

export interface UsuarioSessaoAdmin extends SessaoAdmin {
  /** `app_metadata.whatsapp` normalizado, ou `null` se não cadastrado. */
  whatsapp: string | null;
  /** `session_id` da sessão do Supabase — o código e o cookie `admin_2fa` ficam presos a ele. */
  sessionId: string;
}

export type EstadoSessaoAdmin =
  | { estado: 'SEM_SESSAO' }
  | { estado: 'PENDENTE_2FA'; usuario: UsuarioSessaoAdmin }
  | { estado: 'VERIFICADA'; usuario: UsuarioSessaoAdmin };

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

export async function lerSessaoAdmin(cookiesDaRequisicao: CookieSimples[], agora: Date = new Date()): Promise<EstadoSessaoAdmin> {
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookiesDaRequisicao,
      setAll: () => {},
    },
  });

  // `getUser` valida o token no servidor do Supabase; só depois disso o
  // `session_id` lido do mesmo token (via `getSession`) é confiável.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { estado: 'SEM_SESSAO' };
  const { data: dadosSessao } = await supabase.auth.getSession();
  const sessionId = dadosSessao.session ? sessionIdDoAccessToken(dadosSessao.session.access_token) : null;
  if (!sessionId) return { estado: 'SEM_SESSAO' };

  const usuario: UsuarioSessaoAdmin = {
    id: data.user.id,
    email: data.user.email ?? null,
    nome: nomeDoUserMetadata(data.user.user_metadata),
    whatsapp: whatsappDoAppMetadata(data.user.app_metadata),
    sessionId,
  };

  const cookie2fa = cookiesDaRequisicao.find((c) => c.name === NOME_COOKIE_SEGUNDO_FATOR)?.value;
  const verificada = cookieSegundoFatorValido(env.SESSION_SECRET, cookie2fa, usuario.id, sessionId, agora);
  return verificada ? { estado: 'VERIFICADA', usuario } : { estado: 'PENDENTE_2FA', usuario };
}

/** Para Server Components / rotas: lê os cookies da requisição atual via `next/headers`. */
export async function obterEstadoSessaoAdmin(): Promise<EstadoSessaoAdmin> {
  const cookieStore = await cookies();
  return lerSessaoAdmin(cookieStore.getAll().map((c) => ({ name: c.name, value: c.value })));
}

/** Sessão de admin completa (senha + WhatsApp), ou `null`. */
export async function obterSessaoAdmin(): Promise<SessaoAdmin | null> {
  const resultado = await obterEstadoSessaoAdmin();
  if (resultado.estado !== 'VERIFICADA') return null;
  const { id, email, nome } = resultado.usuario;
  return { id, email, nome };
}
