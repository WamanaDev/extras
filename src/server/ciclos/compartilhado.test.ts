import { describe, expect, it } from 'vitest';
import { ErroHttp } from '@/server/http/erros';
import { ehUnicidadeDe, erroCiclo, mensagemBrutaDoErro, nomeConstraintBruto } from './compartilhado';

describe('erroCiclo', () => {
  it('monta um ErroHttp com o código de negócio do domínio (fora do catálogo central — _conflitos.md item 12)', () => {
    const erro = erroCiclo(409, 'CICLO_JA_EXISTE', 'Já existe.');
    expect(erro).toBeInstanceOf(ErroHttp);
    expect(erro.status).toBe(409);
    expect(erro.codigo).toBe('CICLO_JA_EXISTE');
    expect(erro.message).toBe('Já existe.');
    expect(erro.detalhes).toBeNull();
  });

  it('aceita detalhes (mapa campo → problema, reaproveitado para listar impacto/avisos)', () => {
    const erro = erroCiclo(409, 'AVISOS_NAO_CONFIRMADOS', 'Existem avisos.', { DEFICIT_COBERTURA: '2 dias' });
    expect(erro.detalhes).toEqual({ DEFICIT_COBERTURA: '2 dias' });
  });
});

describe('nomeConstraintBruto / ehUnicidadeDe', () => {
  it('lê o nome da constraint de meta.constraint', () => {
    const erro = { code: '23505', meta: { constraint: 'ciclo_unico' } };
    expect(nomeConstraintBruto(erro)).toBe('ciclo_unico');
    expect(ehUnicidadeDe(erro, 'ciclo_unico')).toBe(true);
    expect(ehUnicidadeDe(erro, 'outra_constraint')).toBe(false);
  });

  it('não classifica erro sem SQLSTATE de unicidade, mesmo com nome de constraint batendo', () => {
    const erro = { code: '23503', meta: { constraint: 'ciclo_unico' } };
    expect(ehUnicidadeDe(erro, 'ciclo_unico')).toBe(false);
  });

  it('erro nulo/indefinido não quebra', () => {
    expect(nomeConstraintBruto(null)).toBeUndefined();
    expect(ehUnicidadeDe(undefined, 'ciclo_unico')).toBe(false);
  });
});

describe('mensagemBrutaDoErro', () => {
  it('prefere meta.message quando presente', () => {
    expect(mensagemBrutaDoErro({ meta: { message: 'CICLO_FECHADO' }, message: 'outro' })).toBe('CICLO_FECHADO');
  });

  it('cai para message quando meta.message ausente', () => {
    expect(mensagemBrutaDoErro({ message: 'CICLO_INEXISTENTE' })).toBe('CICLO_INEXISTENTE');
  });

  it('erro não-objeto devolve string vazia', () => {
    expect(mensagemBrutaDoErro('erro cru')).toBe('');
    expect(mensagemBrutaDoErro(null)).toBe('');
  });
});
