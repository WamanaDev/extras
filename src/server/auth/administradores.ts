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
  /** Nunca fez login — convite ainda não aceito (`ultimoLoginEm === null`). */
  pendente: boolean;
}

export interface EntradaConvidarAdministrador {
  email: string;
  nome?: string;
  /**
   * Pra onde o link do e-mail de convite leva depois de autenticar
   * (`/admin/definir-senha`, absoluto — ex. `https://app.exemplo.com/admin/definir-senha`).
   * Sem isso, o Supabase cai no "Site URL" padrão configurado no projeto —
   * que pode ser (e foi, achado em uso real) a tela errada, tipo `/login`
   * de colaborador. Também precisa estar na allowlist de "Redirect URLs" do
   * projeto no Supabase Dashboard (Authentication → URL Configuration),
   * senão o Supabase ignora silenciosamente e usa o Site URL mesmo assim.
   */
  redirectTo: string;
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
    const ultimoLoginEm = usuario.last_sign_in_at ?? null;
    return {
      id: usuario.id,
      email: usuario.email ?? null,
      nome: typeof nome === 'string' ? nome : null,
      criadoEm: usuario.created_at,
      ultimoLoginEm,
      mfaAtivo: (usuario.factors?.length ?? 0) > 0,
      pendente: ultimoLoginEm === null,
    };
  });
}

/**
 * Revoga um administrador — deleta a conta do Supabase Auth
 * (`auth.admin.deleteUser`). Mesma operação serve pra revogar acesso de um
 * admin já ativo e pra cancelar um convite ainda não aceito (`pendente`):
 * o Supabase não distingue as duas coisas como objetos separados, é a
 * mesma linha em `auth.users` — só o `last_sign_in_at` (`pendente` acima)
 * conta a diferença.
 *
 * Não valida "é o último admin"/"é você mesmo" aqui — quem chama
 * (`route.ts`) decide essas regras, este módulo só executa.
 */
export async function revogarAdministrador(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);
}

export async function convidarAdministrador(
  supabase: SupabaseClient,
  entrada: EntradaConvidarAdministrador,
): Promise<{ id: string; email: string | null }> {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(entrada.email, {
    data: { precisaDefinirSenha: true, origem: 'convite_admin', ...(entrada.nome ? { nome: entrada.nome } : {}) },
    redirectTo: entrada.redirectTo,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { id: data.user.id, email: data.user.email ?? null };
}
