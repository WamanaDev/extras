/**
 * SEC-AUD / SEC-INT — Cadeia de hash do `audit_log`.
 *
 * Funções puras, sem I/O — testáveis sem banco. `registrar.ts` e
 * `validar-cadeia.ts` são finas cascas de I/O em cima destas.
 *
 * Fórmula fixada pela spec (`integridade.md`):
 * `hash = sha256(hash_anterior || id || ator_id || acao || entidade_id || payload::text || criado_em)`
 *
 * `payload::text` é a serialização JSON estável do payload **já redigido**
 * (o redator de `SEC-CONF` roda antes do hash, nunca depois — senão o hash
 * cobriria dado que nunca deveria ter sido persistido).
 */
import { createHash } from 'node:crypto';

export interface EntradaHash {
  hashAnterior: string | null;
  id: string;
  atorId: string | null;
  acao: string;
  entidadeId: string | null;
  /** Já redigido — string JSON estável, não o objeto bruto. */
  payloadTexto: string;
  /** ISO-8601. */
  criadoEm: string;
}

/** Valor de `hash_anterior` para a primeira linha da cadeia. */
export const GENESIS = 'GENESIS';

export function calcularHash(entrada: EntradaHash): string {
  const base = [
    entrada.hashAnterior ?? GENESIS,
    entrada.id,
    entrada.atorId ?? '',
    entrada.acao,
    entrada.entidadeId ?? '',
    entrada.payloadTexto,
    entrada.criadoEm,
  ].join('|');
  return createHash('sha256').update(base, 'utf8').digest('hex');
}

export interface LinhaAuditLog {
  id: string;
  hashAnterior: string | null;
  hash: string;
  atorId: string | null;
  acao: string;
  entidadeId: string | null;
  payloadTexto: string;
  criadoEm: string;
}

export interface QuebraCadeia {
  posicao: number;
  id: string;
  motivo: 'HASH_ANTERIOR_NAO_BATE' | 'HASH_RECALCULADO_DIFERENTE';
}

export interface ResultadoValidacaoCadeia {
  integra: boolean;
  quebras: QuebraCadeia[];
  totalLinhas: number;
}

/**
 * Recalcula a cadeia inteira a partir de `linhas` (já ordenadas por
 * `criado_em`/`id` crescente, exatamente a ordem de inserção) e aponta toda
 * divergência — tanto no encadeamento (`hash_anterior` de uma linha != `hash`
 * da anterior) quanto no próprio hash (alguém alterou um campo da linha sem
 * recalcular). Não corrige nada — só detecta (AUD-4 / I4).
 */
export function validarCadeia(linhas: readonly LinhaAuditLog[]): ResultadoValidacaoCadeia {
  const quebras: QuebraCadeia[] = [];
  let hashAnteriorEsperado: string | null = null;

  linhas.forEach((linha, posicao) => {
    if ((linha.hashAnterior ?? GENESIS) !== (hashAnteriorEsperado ?? GENESIS)) {
      quebras.push({ posicao, id: linha.id, motivo: 'HASH_ANTERIOR_NAO_BATE' });
    }

    const hashRecalculado = calcularHash({
      hashAnterior: linha.hashAnterior,
      id: linha.id,
      atorId: linha.atorId,
      acao: linha.acao,
      entidadeId: linha.entidadeId,
      payloadTexto: linha.payloadTexto,
      criadoEm: linha.criadoEm,
    });

    if (hashRecalculado !== linha.hash) {
      quebras.push({ posicao, id: linha.id, motivo: 'HASH_RECALCULADO_DIFERENTE' });
    }

    hashAnteriorEsperado = linha.hash;
  });

  return { integra: quebras.length === 0, quebras, totalLinhas: linhas.length };
}
