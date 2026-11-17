/**
 * API-AUTH-006 — `POST /api/auth/admin/login`: lógica de negócio.
 *
 * Login administrativo em duas etapas — senha no Supabase Auth + código de
 * 6 dígitos pelo WhatsApp (pedido do usuário: substituiu o MFA TOTP do
 * Supabase, que era atrito demais para a equipe). Ver
 * `./segundo-fator.ts` para o fluxo completo.
 *
 * Esta etapa (senha):
 * 1. Delegar ao Supabase Auth (`ClienteAuthAdmin.entrar`). Senha errada →
 *    `CREDENCIAIS_INVALIDAS` + auditoria `LOGIN_ADMIN_FALHA`.
 * 2. Sem WhatsApp cadastrado (`app_metadata.whatsapp`) → `WHATSAPP_NAO_CADASTRADO`
 *    (403): a conta não opera sem segundo fator.
 * 3. Envia o código e devolve `{ precisaCodigo: true, destino }` — o login
 *    só termina (e só audita `LOGIN_ADMIN_SUCESSO`) em
 *    `POST /api/auth/admin/codigo/verificar`.
 *
 * `ClienteAuthAdmin` isola o SDK do Supabase atrás de uma porta estreita
 * (mesmo padrão de `RepositorioLogin`/`RepositorioPin`) para testar sem rede.
 */
import { erroCredenciaisInvalidas, erroWhatsappNaoCadastrado } from '@/server/http/erros';
import { mascararWhatsapp } from './segundo-fator';

export type ResultadoEntrada =
  | { ok: true; userId: string; email: string; nome: string | null; whatsapp: string | null; sessionId: string }
  | { ok: false };

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
  enviarCodigo(params: { userId: string; sessionId: string; whatsapp: string }): Promise<void>;
}

export interface ParametrosAdminLogin {
  email: string;
  senha: string;
}

export interface RespostaAdminLogin {
  precisaCodigo: true;
  /** Últimos dígitos do WhatsApp para onde o código foi (`•••• 4321`). */
  destino: string;
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

  if (!entrada.whatsapp) {
    // Senha correta, mas sem segundo fator — não é sucesso nem tentativa de
    // senha errada, então não audita. `WHATSAPP_NAO_CADASTRADO` já é o sinal.
    throw erroWhatsappNaoCadastrado();
  }

  await repo.enviarCodigo({ userId: entrada.userId, sessionId: entrada.sessionId, whatsapp: entrada.whatsapp });
  return { precisaCodigo: true, destino: mascararWhatsapp(entrada.whatsapp) };
}
