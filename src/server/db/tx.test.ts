/**
 * Testes de unidade sobre a lógica pura de `tx.ts` (ordenação de locks,
 * tradução de códigos de erro). Não abrem conexão com banco — por isso
 * rodam sem Postgres real.
 *
 * As anomalias de concorrência T1–T10 da spec (`SEC-ACID`) exigem Postgres
 * real com múltiplas conexões simultâneas e são declaradas, mas marcadas
 * como PENDENTES DE EXECUÇÃO neste ambiente — ver
 * `tests/integration/acid.pendente.md`.
 */
import { describe, expect, it } from 'vitest';
import {
  CODIGO_ERRO_POSTGRES,
  codigoSqlstate,
  ehLockTimeout,
  ehViolacaoDeUnicidade,
  ordenarParaLock,
} from './tx';

describe('ordenarParaLock — prevenção de deadlock (SEC-ACID)', () => {
  it('ordena ids de forma determinística, independente da ordem de entrada', () => {
    const a = ordenarParaLock(['c3', 'c1', 'c2']);
    const b = ordenarParaLock(['c2', 'c3', 'c1']);
    expect(a).toEqual(['c1', 'c2', 'c3']);
    expect(a).toEqual(b);
  });

  it('não muta o array de entrada', () => {
    const entrada = ['b', 'a'];
    ordenarParaLock(entrada);
    expect(entrada).toEqual(['b', 'a']);
  });

  it('lista vazia e lista de um elemento não quebram', () => {
    expect(ordenarParaLock([])).toEqual([]);
    expect(ordenarParaLock(['x'])).toEqual(['x']);
  });
});

describe('tradução de SQLSTATE (T8: SISTEMA_OCUPADO / T6: JA_MARCADO)', () => {
  it('reconhece 55P03 (lock_timeout) via meta.code', () => {
    const erro = { meta: { code: CODIGO_ERRO_POSTGRES.LOCK_TIMEOUT } };
    expect(codigoSqlstate(erro)).toBe('55P03');
    expect(ehLockTimeout(erro)).toBe(true);
    expect(ehViolacaoDeUnicidade(erro)).toBe(false);
  });

  it('reconhece 23505 (unique_violation) e 23P01 (exclusion_violation) como violação de unicidade', () => {
    expect(ehViolacaoDeUnicidade({ code: '23505' })).toBe(true);
    expect(ehViolacaoDeUnicidade({ code: '23P01' })).toBe(true);
    expect(ehViolacaoDeUnicidade({ code: '42601' })).toBe(false);
  });

  it('erro sem código reconhecível não é classificado como nenhum dos dois', () => {
    expect(ehLockTimeout(new Error('erro genérico'))).toBe(false);
    expect(ehViolacaoDeUnicidade(null)).toBe(false);
    expect(ehViolacaoDeUnicidade(undefined)).toBe(false);
  });
});
