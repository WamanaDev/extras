import { describe, expect, it } from 'vitest';
import { GENESIS, calcularHash, validarCadeia, type LinhaAuditLog } from './hash-chain';

function linha(parcial: Partial<LinhaAuditLog> & Pick<LinhaAuditLog, 'id' | 'hashAnterior'>): LinhaAuditLog {
  const base: LinhaAuditLog = {
    id: parcial.id,
    hashAnterior: parcial.hashAnterior,
    hash: '',
    atorId: parcial.atorId ?? 'colab-1',
    acao: parcial.acao ?? 'EXTRA_MARCADA',
    entidadeId: parcial.entidadeId ?? 'marcacao-1',
    payloadTexto: parcial.payloadTexto ?? '{"plantaoId":"p1"}',
    criadoEm: parcial.criadoEm ?? '2026-09-03T10:00:00.000Z',
  };
  const hash = calcularHash({ ...base, hashAnterior: base.hashAnterior });
  return { ...base, hash: parcial.hash ?? hash };
}

describe('calcularHash — determinístico e sensível a cada campo', () => {
  it('mesma entrada produz o mesmo hash', () => {
    const entrada = {
      hashAnterior: GENESIS,
      id: '1',
      atorId: 'a',
      acao: 'LOGIN_SUCESSO',
      entidadeId: null,
      payloadTexto: '{}',
      criadoEm: '2026-01-01T00:00:00.000Z',
    };
    expect(calcularHash(entrada)).toBe(calcularHash({ ...entrada }));
  });

  it('mudar qualquer campo muda o hash (payload, ator, ação, timestamp)', () => {
    const base = calcularHash({
      hashAnterior: GENESIS,
      id: '1',
      atorId: 'a',
      acao: 'LOGIN_SUCESSO',
      entidadeId: null,
      payloadTexto: '{}',
      criadoEm: '2026-01-01T00:00:00.000Z',
    });
    expect(calcularHash({
      hashAnterior: GENESIS, id: '1', atorId: 'b', acao: 'LOGIN_SUCESSO', entidadeId: null, payloadTexto: '{}', criadoEm: '2026-01-01T00:00:00.000Z',
    })).not.toBe(base);
    expect(calcularHash({
      hashAnterior: GENESIS, id: '1', atorId: 'a', acao: 'LOGIN_FALHA', entidadeId: null, payloadTexto: '{}', criadoEm: '2026-01-01T00:00:00.000Z',
    })).not.toBe(base);
    expect(calcularHash({
      hashAnterior: 'outro-hash', id: '1', atorId: 'a', acao: 'LOGIN_SUCESSO', entidadeId: null, payloadTexto: '{}', criadoEm: '2026-01-01T00:00:00.000Z',
    })).not.toBe(base);
  });
});

describe('validarCadeia (A5 / I4 / AUD-4) — detecta adulteração', () => {
  it('cadeia íntegra de 3 linhas não acusa quebra', () => {
    const l1 = linha({ id: '1', hashAnterior: null });
    const l2 = linha({ id: '2', hashAnterior: l1.hash, acao: 'EXTRA_CANCELADA' });
    const l3 = linha({ id: '3', hashAnterior: l2.hash, acao: 'LOGIN_SUCESSO' });

    const resultado = validarCadeia([l1, l2, l3]);
    expect(resultado.integra).toBe(true);
    expect(resultado.quebras).toEqual([]);
    expect(resultado.totalLinhas).toBe(3);
  });

  it('cadeia vazia é íntegra por vacuidade', () => {
    expect(validarCadeia([]).integra).toBe(true);
  });

  it('linha com payload adulterado após o fato é detectada (hash não recalcula igual)', () => {
    const l1 = linha({ id: '1', hashAnterior: null });
    const l2 = linha({ id: '2', hashAnterior: l1.hash });
    // Simula um UPDATE direto no banco por superusuário: campo mudou, hash gravado não.
    const l2Adulterada: LinhaAuditLog = { ...l2, payloadTexto: '{"plantaoId":"outro"}' };

    const resultado = validarCadeia([l1, l2Adulterada]);
    expect(resultado.integra).toBe(false);
    expect(resultado.quebras.some((q) => q.motivo === 'HASH_RECALCULADO_DIFERENTE' && q.id === '2')).toBe(true);
  });

  it('linha removida do meio quebra o encadeamento hash_anterior', () => {
    const l1 = linha({ id: '1', hashAnterior: null });
    const l2 = linha({ id: '2', hashAnterior: l1.hash });
    const l3 = linha({ id: '3', hashAnterior: l2.hash });
    // l2 "desapareceu" — l3 aponta para um hash_anterior que não é mais o predecessor direto.
    const resultado = validarCadeia([l1, l3]);
    expect(resultado.integra).toBe(false);
    expect(resultado.quebras.some((q) => q.motivo === 'HASH_ANTERIOR_NAO_BATE' && q.id === '3')).toBe(true);
  });
});
