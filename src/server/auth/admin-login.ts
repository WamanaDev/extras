/**
 * API-AUTH-006 — `POST /api/auth/admin/login`: lógica de negócio.
 *
 * Login administrativo delegado ao Supabase Auth, com MFA obrigatório
 * (`API-AUTH-006-admin-login.md`, "Fluxo"):
 * 1. Delegar ao Supabase Auth (`ClienteAuthAdmin.entrar`)
 * 2. Exigir fator MFA — admin sem MFA verificado é bloqueado até cadastrar
 * 3. Auditar `LOGIN_ADMIN_SUCESSO` / `LOGIN_ADMIN_FALHA`
 *
 * `ClienteAuthAdmin` isola o SDK do Supabase (`@supabase/supabase-js`/`ssr`)
 * atrás de uma porta estreita — mesmo padrão de `RepositorioLogin`/`RepositorioPin`
 * (Onda 2) — para que este módulo seja testável sem rede/Supabase real. A
 * rota (`route.ts`) implementa `ClienteAuthAdmin` por cima do client real.
 *
 * MFA (AAL — Authenticator Assurance Level, `supabase.auth.mfa`):
 * - Sem nenhum fator `verified` cadastrado → `MFA_OBRIGATORIO` (403), mesmo
 *   com senha correta — a conta não pode operar sem segundo fator.
 * - Fator cadastrado mas o nível atual da sessão ainda não é `aal2` → a etapa
 *   de senha passou, falta o desafio MFA: devolve `{ precisaMfa: true,
 *   desafioId }` (o cliente completa em uma chamada separada ao SDK do
 *   Supabase, fora do escopo desta rota — `API-AUTH-006`, "Response 200").
 * - Já em `aal2` (sessão que já completou o desafio) → login concluído.
 */
import { erroCredenciaisInvalidas, erroMfaObrigatorio } from '@/server/http/erros';

export interface FatorMfa {
  id: string;
  status: 'verified' | 'unverified';
}

export type ResultadoEntrada =
  | { ok: true; userId: string; email: string; nome: string | null }
  | { ok: false };

export interface NivelAsseguranca {
  atual: string; // 'aal1' | 'aal2'
  proximo: string; // 'aal1' | 'aal2'
}

/** Porta de acesso ao Supabase Auth — a rota real implementa isto sobre `@supabase/ssr`. */
export interface ClienteAuthAdmin {
  entrar(email: string, senha: string): Promise<ResultadoEntrada>;
  listarFatoresMfa(): Promise<FatorMfa[]>;
  nivelAsseguranca(): Promise<NivelAsseguranca>;
  desafiarFator(factorId: string): Promise<string>;
}

export interface EventoAdminLoginAuditoria {
  sucesso: boolean;
  email: string;
  adminId: string | null;
}

export interface RepositorioAdminLogin {
  auditar(evento: EventoAdminLoginAuditoria): Promise<void>;
}

export interface ParametrosAdminLogin {
  email: string;
  senha: string;
}

export interface RespostaAdminLoginMfa {
  precisaMfa: true;
  desafioId: string;
}

export interface RespostaAdminLoginSucesso {
  admin: { id: string; email: string; nome: string | null };
}

export type RespostaAdminLogin = RespostaAdminLoginMfa | RespostaAdminLoginSucesso;

export async function processarAdminLogin(
  auth: ClienteAuthAdmin,
  repo: RepositorioAdminLogin,
  params: ParametrosAdminLogin,
): Promise<RespostaAdminLogin> {
  const entrada = await auth.entrar(params.email, params.senha);

  if (!entrada.ok) {
    await repo.auditar({ sucesso: false, email: params.email, adminId: null });
    throw erroCredenciaisInvalidas();
  }

  const fatores = await auth.listarFatoresMfa();
  const fatoresVerificados = fatores.filter((f) => f.status === 'verified');

  if (fatoresVerificados.length === 0) {
    // Senha correta, mas sem segundo fator — não é sucesso de login, então
    // não audita LOGIN_ADMIN_SUCESSO; também não é uma tentativa de senha
    // errada, então não audita _FALHA. `MFA_OBRIGATORIO` já é o sinal.
    throw erroMfaObrigatorio();
  }

  const nivel = await auth.nivelAsseguranca();
  if (nivel.proximo === 'aal2' && nivel.atual !== 'aal2') {
    const desafioId = await auth.desafiarFator(fatoresVerificados[0]!.id);
    return { precisaMfa: true, desafioId };
  }

  await repo.auditar({ sucesso: true, email: params.email, adminId: entrada.userId });
  return { admin: { id: entrada.userId, email: entrada.email, nome: entrada.nome } };
}
