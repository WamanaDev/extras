/**
 * Testes de unidade para o mapeamento centralizado de SQLSTATE → erro de API
 * (DB-002, `specs/03-banco/constraints.md`, seção "Códigos de erro → API").
 * Lógica pura — não abre conexão com banco.
 */
import { describe, expect, it } from 'vitest';
import { erroApiParaPostgres, MAPA_ERROS_POSTGRES } from './erros';

describe('MAPA_ERROS_POSTGRES — transcrição literal da tabela de constraints.md', () => {
  it('tem exatamente as 7 linhas da spec', () => {
    expect(MAPA_ERROS_POSTGRES).toHaveLength(7);
  });

  it('cobre todos os SQLSTATE da spec', () => {
    const codigos = MAPA_ERROS_POSTGRES.map((l) => l.sqlstate).sort();
    expect(codigos).toEqual(['23503', '23505', '23514', '23P01', '23P01', '40P01', '55P03'].sort());
  });
});

describe('erroApiParaPostgres', () => {
  it('23505 em marcacao_unica_confirmada → JA_MARCADO / 409', () => {
    const erro = { meta: { code: '23505', constraint: 'marcacao_unica_confirmada' } };
    expect(erroApiParaPostgres(erro)).toEqual({
      sqlstate: '23505',
      constraint: 'marcacao_unica_confirmada',
      erro: 'JA_MARCADO',
      http: 409,
    });
  });

  it('23P01 em excl_marcacao_sobreposta → CONFLITO_DE_HORARIO / 409', () => {
    const erro = { meta: { code: '23P01', constraint: 'excl_marcacao_sobreposta' } };
    expect(erroApiParaPostgres(erro)?.erro).toBe('CONFLITO_DE_HORARIO');
    expect(erroApiParaPostgres(erro)?.http).toBe(409);
  });

  it('23P01 em excl_escala_sobreposta → ESCALA_SOBREPOSTA / 409 (mesmo SQLSTATE, constraint diferente)', () => {
    const erro = { meta: { code: '23P01', constraint: 'excl_escala_sobreposta' } };
    expect(erroApiParaPostgres(erro)?.erro).toBe('ESCALA_SOBREPOSTA');
  });

  it('23P01 sem nome de constraint disponível cai no primeiro candidato compatível', () => {
    const erro = { meta: { code: '23P01' } };
    const resultado = erroApiParaPostgres(erro);
    expect(resultado?.sqlstate).toBe('23P01');
    expect(['CONFLITO_DE_HORARIO', 'ESCALA_SOBREPOSTA']).toContain(resultado?.erro);
  });

  it('23514 em chk_vagas → SEM_VAGA / 409', () => {
    const erro = { meta: { code: '23514', constraint: 'chk_vagas' } };
    expect(erroApiParaPostgres(erro)).toMatchObject({ erro: 'SEM_VAGA', http: 409 });
  });

  it('23503 (qualquer FK) → REFERENCIA_INVALIDA / 409', () => {
    expect(erroApiParaPostgres({ code: '23503' })).toMatchObject({ erro: 'REFERENCIA_INVALIDA', http: 409 });
    expect(erroApiParaPostgres({ meta: { code: '23503', constraint: 'plantao_ciclo_id_fkey' } })).toMatchObject({
      erro: 'REFERENCIA_INVALIDA',
      http: 409,
    });
  });

  it('55P03 (lock_timeout) → SISTEMA_OCUPADO / 503', () => {
    expect(erroApiParaPostgres({ code: '55P03' })).toMatchObject({ erro: 'SISTEMA_OCUPADO', http: 503 });
  });

  it('40P01 (deadlock) → SISTEMA_OCUPADO / 503', () => {
    expect(erroApiParaPostgres({ code: '40P01' })).toMatchObject({ erro: 'SISTEMA_OCUPADO', http: 503 });
  });

  it('SQLSTATE não mapeado retorna undefined (chamador trata como 500, não inventa erro de API)', () => {
    expect(erroApiParaPostgres({ code: '42601' })).toBeUndefined();
  });

  it('erro sem código reconhecível retorna undefined', () => {
    expect(erroApiParaPostgres(new Error('erro genérico'))).toBeUndefined();
    expect(erroApiParaPostgres(null)).toBeUndefined();
    expect(erroApiParaPostgres(undefined)).toBeUndefined();
  });
});
