/**
 * API-AUTH-002 — Sessão do colaborador: criação e renovação deslizante.
 *
 * Entregável de `specs/04-api/auth/API-AUTH-002-pin.md`. Reaproveita
 * `gerarTokenSessao`/`hashDoToken` de `./credenciais.ts` (Onda 0) — nunca
 * reimplementa o hashing do token aqui.
 *
 * Duração: 8h fixas na criação (`API-AUTH-002`, "ACID"/"CIA"). Renovação
 * deslizante usada por `API-AUTH-005` (`GET /api/auth/me`): se restar menos
 * de 2h para expirar, renova para +8h a partir de agora, respeitando um teto
 * de 12h desde a criação original (nunca uma sessão "eterna" só de o usuário
 * ficar com a aba aberta).
 */
import type { ClienteTransacao } from '@/server/db/tx';
import { gerarTokenSessao } from './credenciais';

export const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000;
export const TETO_SESSAO_MS = 12 * 60 * 60 * 1000;
export const LIMIAR_RENOVACAO_MS = 2 * 60 * 60 * 1000;

export interface SessaoCriada {
  token: string;
  expiraEm: Date;
}

export interface ParametrosCriarSessao {
  colaboradorId: string;
  ip: string;
  userAgent: string;
  agora: Date;
}

/** Cria a sessão do colaborador dentro de `tx` — só o SHA-256 do token vai ao banco (SEC-CONF). */
export async function criarSessaoColaborador(tx: ClienteTransacao, params: ParametrosCriarSessao): Promise<SessaoCriada> {
  const { token, tokenHash } = gerarTokenSessao();
  const expiraEm = new Date(params.agora.getTime() + DURACAO_SESSAO_MS);

  await tx.sessaoColaborador.create({
    data: {
      colaboradorId: params.colaboradorId,
      tokenHash,
      expiraEm,
      ip: params.ip,
      userAgent: params.userAgent,
    },
  });

  return { token, expiraEm };
}

export interface SessaoParaRenovacao {
  criadoEm: Date;
  expiraEm: Date;
}

/**
 * Decide a nova `expiraEm` para renovação deslizante — `null` quando a
 * sessão ainda não precisa renovar (falta >= 2h) ou já está no teto de 12h.
 */
export function calcularRenovacaoSessao(sessao: SessaoParaRenovacao, agora: Date): Date | null {
  const restanteMs = sessao.expiraEm.getTime() - agora.getTime();
  if (restanteMs >= LIMIAR_RENOVACAO_MS) return null;

  const teto = sessao.criadoEm.getTime() + TETO_SESSAO_MS;
  const candidata = Math.min(agora.getTime() + DURACAO_SESSAO_MS, teto);
  if (candidata <= sessao.expiraEm.getTime()) return null;

  return new Date(candidata);
}
