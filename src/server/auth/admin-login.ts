/**
 * API-AUTH-006 — `POST /api/auth/admin/login`: lógica de negócio.
 *
 * Login administrativo só com e-mail e senha (decisão do produto: por ora
 * não há segundo fator — ver `_conflitos.md`).
 *
 * 1. Delegar ao Supabase Auth (`ClienteAuthAdmin.entrar`). Senha errada →
 *    `CREDENCIAIS_INVALIDAS` (401) + auditoria `LOGIN_ADMIN_FALHA`.
 * 2. Senha certa → auditoria `LOGIN_ADMIN_SUCESSO` e `{ admin }`.
 *
 * `ClienteAuthAdmin` isola o SDK do Supabase atrás de uma porta estreita
 * (mesmo padrão de `RepositorioLogin`/`RepositorioPin`) para testar sem rede.
 */
import { erroCredenciaisInvalidas } from '@/server/http/erros';

export type ResultadoEntrada = { ok: true; userId: string; email: string; nome: string | null } | { ok: false };

/** Porta de acesso ao Supabase Auth — a rota real implementa isto sobre `@supabase/ssr`. */
export interface ClienteAuthAdmin {
  entrar(email: string, senha: string): Promise<ResultadoEntrada>;
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

export interface RespostaAdminLogin {
  admin: { id: string; email: string; nome: string | null };
}

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

  await repo.auditar({ sucesso: true, email: entrada.email, adminId: entrada.userId });
  return { admin: { id: entrada.userId, email: entrada.email, nome: entrada.nome } };
}
