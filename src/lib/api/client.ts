/**
 * Cliente HTTP mínimo para os componentes de `06-frontend`.
 *
 * Não reimplementa nenhuma regra de negócio — só chama a rota e devolve o
 * envelope já tipado (`CONVENTIONS.md`, "Envelope de resposta"). Erro de
 * negócio (`409`, `422`, ...) nunca vira `throw` genérico: os componentes
 * precisam do `erro`/`mensagem` para decidir o que fazer (FE-001.3/FE-001.4).
 */

export interface ErroApi {
  erro: string;
  mensagem: string;
  detalhes: Record<string, string> | null;
  requestId: string;
}

/** Erro lançado apenas para falhas de transporte (rede, JSON inválido) — nunca para 4xx/5xx de negócio, que voltam como `ErroApi` no envelope de retorno. */
export class ErroDeRede extends Error {}

export type ResultadoApi<T> =
  | { ok: true; status: number; dados: T; headers: Headers }
  | { ok: false; status: number; erro: ErroApi };

function ehErroApi(valor: unknown): valor is ErroApi {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    'erro' in valor &&
    'mensagem' in valor &&
    typeof (valor as { erro: unknown }).erro === 'string' &&
    typeof (valor as { mensagem: unknown }).mensagem === 'string'
  );
}

export interface OpcoesApi extends RequestInit {
  idempotencyKey?: string;
}

const METODOS_MUTACAO = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function chamarApi<T>(caminho: string, opcoes: OpcoesApi = {}): Promise<ResultadoApi<T>> {
  const { idempotencyKey, headers, ...resto } = opcoes;
  const headersFinais = new Headers(headers);
  if (!headersFinais.has('Content-Type') && resto.body !== undefined) {
    headersFinais.set('Content-Type', 'application/json');
  }
  // SEC-INT (`src/server/http/csrf.ts`): toda rota de mutação exige
  // `X-Requested-With: fetch` — ausente aqui, todo POST/PUT/PATCH/DELETE
  // feito por este cliente seria recusado com 403 (`erroDeCsrf`). Ver
  // `_conflitos.md` para o registro desta correção.
  const metodo = (resto.method ?? 'GET').toUpperCase();
  if (METODOS_MUTACAO.has(metodo) && !headersFinais.has('X-Requested-With')) {
    headersFinais.set('X-Requested-With', 'fetch');
  }
  if (idempotencyKey) headersFinais.set('Idempotency-Key', idempotencyKey);

  let resposta: Response;
  try {
    resposta = await fetch(caminho, { ...resto, headers: headersFinais, credentials: 'same-origin' });
  } catch (erroDeTransporte: unknown) {
    throw new ErroDeRede(
      erroDeTransporte instanceof Error ? erroDeTransporte.message : 'Falha de conexão com o servidor.',
    );
  }

  let corpo: unknown = null;
  const texto = await resposta.text();
  if (texto.length > 0) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = null;
    }
  }

  if (!resposta.ok) {
    if (ehErroApi(corpo)) {
      return { ok: false, status: resposta.status, erro: corpo };
    }
    return {
      ok: false,
      status: resposta.status,
      erro: {
        erro: 'ERRO_DESCONHECIDO',
        mensagem: 'Não foi possível completar a operação. Tente novamente.',
        detalhes: null,
        requestId: '',
      },
    };
  }

  return { ok: true, status: resposta.status, dados: corpo as T, headers: resposta.headers };
}

export function get<T>(caminho: string, opcoes: OpcoesApi = {}): Promise<ResultadoApi<T>> {
  return chamarApi<T>(caminho, { ...opcoes, method: 'GET' });
}

export interface ListaApi<T> {
  itens: T[];
  total: number;
}

/**
 * `GET` para rota paginada (`defineHandler`, `paginacao: true`,
 * `contrato-comum.md` "Paginação"): o corpo na rede é o array solto de itens
 * — não `{itens,total}` — com o total em `X-Total-Count` (ver
 * `src/server/http/handler.ts`, ramo `ehRespostaPaginada`). Este wrapper
 * remonta `{itens,total}` pro consumidor, pra nenhuma página precisar saber
 * desse detalhe de arame. Gap achado só ao logar de verdade no navegador —
 * `_conflitos.md`, item 29.
 */
export async function getLista<T>(caminho: string): Promise<ResultadoApi<ListaApi<T>>> {
  const resultado = await chamarApi<T[]>(caminho, { method: 'GET' });
  if (!resultado.ok) return resultado;
  const total = Number(resultado.headers.get('X-Total-Count') ?? resultado.dados.length);
  return { ok: true, status: resultado.status, dados: { itens: resultado.dados, total }, headers: resultado.headers };
}

export function post<T>(caminho: string, body?: unknown, opcoes: OpcoesApi = {}): Promise<ResultadoApi<T>> {
  const requisicao: OpcoesApi = { ...opcoes, method: 'POST' };
  if (body !== undefined) requisicao.body = JSON.stringify(body);
  return chamarApi<T>(caminho, requisicao);
}

export function patch<T>(caminho: string, body?: unknown, opcoes: OpcoesApi = {}): Promise<ResultadoApi<T>> {
  const requisicao: OpcoesApi = { ...opcoes, method: 'PATCH' };
  if (body !== undefined) requisicao.body = JSON.stringify(body);
  return chamarApi<T>(caminho, requisicao);
}

export function put<T>(caminho: string, body?: unknown, opcoes: OpcoesApi = {}): Promise<ResultadoApi<T>> {
  const requisicao: OpcoesApi = { ...opcoes, method: 'PUT' };
  if (body !== undefined) requisicao.body = JSON.stringify(body);
  return chamarApi<T>(caminho, requisicao);
}

export function del<T>(caminho: string, opcoes: OpcoesApi = {}): Promise<ResultadoApi<T>> {
  return chamarApi<T>(caminho, { ...opcoes, method: 'DELETE' });
}
