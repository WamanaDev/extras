/**
 * SEC-INT — CSRF.
 *
 * `SameSite=Lax` cobre o caso comum. Em complemento: toda rota de mutação
 * exige o header `X-Requested-With: fetch` (ausente em submissão de
 * formulário cross-site) e rejeita `Content-Type:
 * application/x-www-form-urlencoded` — só JSON é aceito em mutação.
 *
 * Puramente funções de verificação sobre `Headers`; não decide o que fazer
 * com o resultado (isso é do handler/middleware que chama).
 */

export type ResultadoCsrf = { ok: true } | { ok: false; motivo: 'HEADER_AUSENTE' | 'CONTENT_TYPE_PROIBIDO' };

const CONTENT_TYPES_PROIBIDOS_EM_MUTACAO = [
  'application/x-www-form-urlencoded',
  'multipart/form-data',
];

/**
 * Verifica os dois requisitos de CSRF para uma rota de mutação
 * (`POST`/`PUT`/`PATCH`/`DELETE`). Retorna o motivo da recusa quando aplicável,
 * para o handler decidir a mensagem — nunca lança.
 */
export function verificarCsrf(headers: Headers): ResultadoCsrf {
  const contentType = (headers.get('content-type') ?? '').toLowerCase();
  if (CONTENT_TYPES_PROIBIDOS_EM_MUTACAO.some((proibido) => contentType.includes(proibido))) {
    return { ok: false, motivo: 'CONTENT_TYPE_PROIBIDO' };
  }

  if (headers.get('x-requested-with') !== 'fetch') {
    return { ok: false, motivo: 'HEADER_AUSENTE' };
  }

  return { ok: true };
}

/** Métodos HTTP considerados mutação para fins de CSRF. */
export const METODOS_MUTACAO = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
