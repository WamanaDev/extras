/**
 * Convite e listagem de administradores — contas do Supabase Auth, sem
 * tabela própria no Prisma (`FUND-003`). Fecha a lacuna documentada em
 * `/admin/configuracoes`: "Administradores são contas do Supabase Auth...
 * nenhuma rota de `04-api/*` expõe CRUD para... contas de administrador".
 *
 * Mesmo mecanismo de `prisma/seed.ts` (`seedAdminInicial`):
 * `auth.admin.inviteUserByEmail` — o Supabase manda o e-mail de convite com
 * o link de `/admin/definir-senha`, nunca gera nem loga senha em claro
 * (SEC-CONF). Sessão fica em AAL1 até o convidado cadastrar o MFA
 * (`/admin/configurar-mfa`) — mesmo fluxo que `/admin/primeiro-acesso`
 * documenta pro admin inicial.
 *
 * "Admin" aqui é literal: **qualquer** conta do Supabase Auth deste projeto
 * é um admin (não existe papel/role separado — `resolverSessaoAdmin`,
 * `src/server/http/handler.ts`, só checa se a sessão é válida). Por isso
 * `listarAdministradores` é `auth.admin.listUsers()` sem filtro nenhum.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AdministradorListado {
  id: string;
  email: string | null;
  nome: string | null;
  criadoEm: string;
  ultimoLoginEm: string | null;
  mfaAtivo: boolean;
}

export interface EntradaConvidarAdministrador {
  email: string;
  nome?: string;
}

/** `E-mail já convidado/cadastrado` é o único erro de negócio esperado — mensagem varia por versão do GoTrue, então casa por substring. */
export function ehEmailJaExistente(mensagem: string): boolean {
  return /registered|exists|already/i.test(mensagem);
}

export async function listarAdministradores(supabase: SupabaseClient): Promise<AdministradorListado[]> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`Falha ao listar administradores: ${error.message}`);

  return data.users.map((usuario) => {
    const metadata = usuario.user_metadata as Record<string, unknown> | undefined;
    const nome = metadata?.nome ?? metadata?.full_name;
    return {
      id: usuario.id,
      email: usuario.email ?? null,
      nome: typeof nome === 'string' ? nome : null,
      criadoEm: usuario.created_at,
      ultimoLoginEm: usuario.last_sign_in_at ?? null,
      mfaAtivo: (usuario.factors?.length ?? 0) > 0,
    };
  });
}

export async function convidarAdministrador(
  supabase: SupabaseClient,
  entrada: EntradaConvidarAdministrador,
): Promise<{ id: string; email: string | null }> {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(entrada.email, {
    data: { precisaDefinirSenha: true, origem: 'convite_admin', ...(entrada.nome ? { nome: entrada.nome } : {}) },
  });

  if (error) {
    throw new Error(error.message);
  }

  return { id: data.user.id, email: data.user.email ?? null };
}
