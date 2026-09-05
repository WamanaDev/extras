/**
 * API-AUTH-004 — `POST /api/auth/colaborador/logout`: lógica de negócio.
 *
 * Fluxo (`API-AUTH-004-logout.md`, "Fluxo"):
 * 1. `UPDATE sessao_colaborador SET revogada_em = now()` pelo hash do token
 * 2. Auditar `LOGOUT`
 * 3. Expirar o cookie (responsabilidade da rota — `route.ts`, `cookies()`)
 *
 * "Sem sessão, responde 204 assim mesmo — logout é idempotente" (Autorização):
 * por isso este módulo aceita `tokenHash: null` (rota chamada sem cookie, ou
 * cookie de um token que não bate com nenhuma sessão) e não faz nada — nunca
 * lança. Mesmo espírito para revogar uma sessão já revogada (logout 2×):
 * `revogarSessao` no `route.ts` só retorna o `colaboradorId` quando de fato
 * revogou uma linha ainda ativa (`revogada_em IS NULL`), então a segunda
 * chamada não audita de novo nem falha.
 */
export interface TransacaoLogout {
  /**
   * `UPDATE sessao_colaborador SET revogada_em = agora WHERE token_hash = ...
   * AND revogada_em IS NULL RETURNING colaborador_id`. Devolve `null` quando
   * nenhuma linha foi afetada (token inexistente ou já revogado) — logout
   * continua idempotente, sem tentar auditar de novo.
   */
  revogarSessao(tokenHash: string, agora: Date): Promise<string | null>;
  /** Só chamado quando `revogarSessao` de fato revogou uma sessão ativa. */
  auditarLogout(colaboradorId: string): Promise<void>;
}

export interface RepositorioLogout {
  emTransacao<T>(callback: (tx: TransacaoLogout) => Promise<T>): Promise<T>;
}

export interface ParametrosLogout {
  /** `null` quando não há cookie de sessão na requisição — idempotente, não faz nada. */
  tokenHash: string | null;
  agora: Date;
}

export async function processarLogout(repo: RepositorioLogout, params: ParametrosLogout): Promise<void> {
  if (params.tokenHash === null) return;

  await repo.emTransacao(async (tx) => {
    const colaboradorId = await tx.revogarSessao(params.tokenHash!, params.agora);
    if (colaboradorId !== null) {
      await tx.auditarLogout(colaboradorId);
    }
  });
}
