/**
 * SEC-CONF — Redator central de log.
 *
 * "Dado pessoal nunca em log" — specs/02-seguranca/confidencialidade.md.
 *
 * Todo log estruturado passa por este módulo antes de sair: qualquer
 * propriedade cujo nome (case-insensitive, ignorando separadores) bata com a
 * lista bloqueada é substituída por `"[REDIGIDO]"`, recursivamente, em
 * objetos, arrays e Maps.
 *
 * Este módulo NÃO decide o que logar — só limpa o que for logado. Ele é
 * deliberadamente conservador: na dúvida, redige.
 */

/** Chaves nunca logadas, em claro. Comparação normalizada (minúsculas, sem separadores). */
const CHAVES_BLOQUEADAS = new Set([
  'pin',
  'token',
  'cookie',
  'authorization',
  'tokenhash',
  'senha',
]);

const MASCARA = '[REDIGIDO]';

function normalizarChave(chave: string): string {
  return chave.toLowerCase().replace(/[_\-\s]/g, '');
}

function chaveBloqueada(chave: string): boolean {
  return CHAVES_BLOQUEADAS.has(normalizarChave(chave));
}

/**
 * `redigir` — aplica a redação recursivamente a qualquer valor serializável em
 * log (objetos, arrays, Map, Date, primitivos). Ciclos são cortados com
 * `"[CICLO]"` em vez de estourar pilha.
 */
export function redigir(valor: unknown, vistos: WeakSet<object> = new WeakSet()): unknown {
  if (valor === null || valor === undefined) return valor;

  if (typeof valor === 'string') return valor;

  if (typeof valor === 'number' || typeof valor === 'boolean' || typeof valor === 'bigint') {
    return valor;
  }

  if (valor instanceof Date) return valor.toISOString();

  if (Array.isArray(valor)) {
    if (vistos.has(valor)) return '[CICLO]';
    vistos.add(valor);
    return valor.map((item) => redigir(item, vistos));
  }

  if (valor instanceof Map) {
    if (vistos.has(valor)) return '[CICLO]';
    vistos.add(valor);
    const resultado: Record<string, unknown> = {};
    for (const [chave, item] of valor.entries()) {
      const chaveStr = String(chave);
      resultado[chaveStr] = chaveBloqueada(chaveStr) ? MASCARA : redigir(item, vistos);
    }
    return resultado;
  }

  if (typeof valor === 'object') {
    if (vistos.has(valor)) return '[CICLO]';
    vistos.add(valor);
    const origem = valor as Record<string, unknown>;
    const resultado: Record<string, unknown> = {};
    for (const chave of Object.keys(origem)) {
      resultado[chave] = chaveBloqueada(chave) ? MASCARA : redigir(origem[chave], vistos);
    }
    return resultado;
  }

  // function, symbol etc. — não deveriam aparecer em payload de log.
  return '[NAO_SERIALIZAVEL]';
}

/**
 * Serializa `valor` já redigido, para uso direto num logger JSON.
 */
export function redigirParaLog(valor: unknown): string {
  return JSON.stringify(redigir(valor));
}
