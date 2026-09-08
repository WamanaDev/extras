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
 *
 * `permitirMultipart` (default `false`): rejeitar `multipart/form-data`
 * incondicionalmente bloqueava a ÚNICA rota do app que legitimamente precisa
 * dele — `POST /api/admin/colaboradores/importar` (upload de CSV) sempre
 * devolvia 403, mesmo com o header `X-Requested-With` correto (achado em uso
 * real, "importação em lote não funciona"). A defesa contra CSRF aqui é o
 * header `X-Requested-With: fetch` (uma submissão de `<form>` cross-site não
 * consegue setar headers customizados, com ou sem multipart) — bloquear
 * `application/x-www-form-urlencoded` continua incondicional (é exatamente o
 * Content-Type que um `<form>` HTML simples envia sem JS). Rotas que
 * precisam de upload de arquivo passam `permitirMultipart: true`
 * explicitamente; todas as outras mantêm o bloqueio de antes.
 */
export function verificarCsrf(headers: Headers, opcoes: { permitirMultipart?: boolean } = {}): ResultadoCsrf {
  const contentType = (headers.get('content-type') ?? '').toLowerCase();
  const proibidos = opcoes.permitirMultipart
    ? CONTENT_TYPES_PROIBIDOS_EM_MUTACAO.filter((proibido) => proibido !== 'multipart/form-data')
    : CONTENT_TYPES_PROIBIDOS_EM_MUTACAO;
  if (proibidos.some((proibido) => contentType.includes(proibido))) {
    return { ok: false, motivo: 'CONTENT_TYPE_PROIBIDO' };
  }

  if (headers.get('x-requested-with') !== 'fetch') {
    return { ok: false, motivo: 'HEADER_AUSENTE' };
  }

  return { ok: true };
}

/** Métodos HTTP considerados mutação para fins de CSRF. */
export const METODOS_MUTACAO = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
