/**
 * API-000 — testes do catálogo/tradução de erro (`./erros.ts`).
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ErroHttp,
  erroDeNegocio,
  erroDeValidacao,
  erroNaoAutenticado,
  erroNaoEncontrado,
  erroSemPermissao,
  erroLimiteExcedido,
  erroDeCsrf,
  formatarRespostaErro,
  traduzirErro,
  detalhesDeZodError,
} from './erros';

describe('fábricas de ErroHttp', () => {
  it('erroNaoAutenticado → 401', () => {
    expect(erroNaoAutenticado().status).toBe(401);
    expect(erroNaoAutenticado().codigo).toBe('NAO_AUTENTICADO');
  });

  it('erroSemPermissao → 403', () => {
    expect(erroSemPermissao().status).toBe(403);
  });

  it('erroNaoEncontrado → 404 (mesmo código/status para recurso inexistente e recurso de terceiro)', () => {
    const erro = erroNaoEncontrado();
    expect(erro.status).toBe(404);
    expect(erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
  });

  it('erroDeNegocio → 409 por padrão, com código customizável', () => {
    expect(erroDeNegocio('recusado').status).toBe(409);
    expect(erroDeNegocio('recusado').codigo).toBe('REGRA_DE_NEGOCIO');
    expect(erroDeNegocio('recusado', 'JA_MARCADO').codigo).toBe('JA_MARCADO');
  });

  it('erroDeValidacao → 422 com detalhes', () => {
    const erro = erroDeValidacao({ campo: 'obrigatório' });
    expect(erro.status).toBe(422);
    expect(erro.detalhes).toEqual({ campo: 'obrigatório' });
  });

  it('erroLimiteExcedido → 429 com retryAfterSegundos', () => {
    const erro = erroLimiteExcedido(30);
    expect(erro.status).toBe(429);
    expect(erro.retryAfterSegundos).toBe(30);
  });

  it('erroDeCsrf distingue header ausente de content-type proibido', () => {
    expect(erroDeCsrf('HEADER_AUSENTE').codigo).toBe('CSRF_INVALIDO');
    expect(erroDeCsrf('CONTENT_TYPE_PROIBIDO').codigo).toBe('CONTENT_TYPE_INVALIDO');
    expect(erroDeCsrf('HEADER_AUSENTE').status).toBe(403);
  });
});

describe('detalhesDeZodError', () => {
  it('mapeia caminho → mensagem', () => {
    const schema = z.object({ nome: z.string().min(1), idade: z.number().int() });
    const resultado = schema.safeParse({ nome: '', idade: 'x' });
    if (resultado.success) throw new Error('esperava falha');
    const detalhes = detalhesDeZodError(resultado.error);
    expect(Object.keys(detalhes)).toEqual(expect.arrayContaining(['nome', 'idade']));
  });

  it('concatena múltiplas mensagens do mesmo campo com "; "', () => {
    const schema = z.string().min(5).max(2);
    const resultado = schema.safeParse('abc');
    if (resultado.success) throw new Error('esperava falha');
    const detalhes = detalhesDeZodError(resultado.error);
    expect(detalhes['_']).toContain(';');
  });
});

describe('traduzirErro', () => {
  it('ErroHttp é repassado intacto', () => {
    const original = erroNaoEncontrado('específico');
    expect(traduzirErro(original)).toBe(original);
  });

  it('ZodError vira 422 VALIDACAO', () => {
    const resultado = z.object({ x: z.string() }).safeParse({});
    if (resultado.success) throw new Error('esperava falha');
    const traduzido = traduzirErro(resultado.error);
    expect(traduzido.status).toBe(422);
    expect(traduzido.codigo).toBe('VALIDACAO');
  });

  it('erro do driver Postgres com SQLSTATE mapeado vira o ErroApi correspondente (409, mensagem em português)', () => {
    const erroPostgres = { meta: { code: '23505', constraint: 'marcacao_unica_confirmada' } };
    const traduzido = traduzirErro(erroPostgres);
    expect(traduzido.status).toBe(409);
    expect(traduzido.codigo).toBe('JA_MARCADO');
    expect(traduzido.message).toBe('Este plantão já está marcado.');
    expect(traduzido.message).not.toMatch(/sqlstate|constraint|23505/i);
  });

  it('lock timeout (55P03) vira SISTEMA_OCUPADO 503 com Retry-After de 1s', () => {
    const traduzido = traduzirErro({ meta: { code: '55P03' } });
    expect(traduzido.status).toBe(503);
    expect(traduzido.codigo).toBe('SISTEMA_OCUPADO');
    expect(traduzido.retryAfterSegundos).toBe(1);
  });

  it('SQLSTATE desconhecido → 500 ERRO_INTERNO, não inventa um ErroApi', () => {
    const traduzido = traduzirErro({ meta: { code: '99999' } });
    expect(traduzido.status).toBe(500);
    expect(traduzido.codigo).toBe('ERRO_INTERNO');
  });

  it('erro arbitrário (bug de programação) → 500, mensagem genérica, causa original preservada só para log', () => {
    const bug = new TypeError('cannot read property x of undefined');
    const traduzido = traduzirErro(bug);
    expect(traduzido.status).toBe(500);
    expect(traduzido.message).not.toContain('cannot read property');
    expect(traduzido.causaOriginal).toBe(bug);
  });
});

describe('formatarRespostaErro', () => {
  it('monta o envelope exato de CONVENTIONS.md', () => {
    const erro = erroDeValidacao({ campo: 'problema' }, 'Dados inválidos.');
    const resposta = formatarRespostaErro(erro, 'req-123');
    expect(resposta).toEqual({
      erro: 'VALIDACAO',
      mensagem: 'Dados inválidos.',
      detalhes: { campo: 'problema' },
      requestId: 'req-123',
    });
  });

  it('detalhes é null fora de erro de validação', () => {
    const resposta = formatarRespostaErro(erroNaoEncontrado(), 'req-123');
    expect(resposta.detalhes).toBeNull();
  });
});

describe('ErroHttp', () => {
  it('é instância de Error (compatível com throw/catch nativo)', () => {
    expect(erroDeNegocio('x')).toBeInstanceOf(Error);
    expect(erroDeNegocio('x')).toBeInstanceOf(ErroHttp);
  });
});
