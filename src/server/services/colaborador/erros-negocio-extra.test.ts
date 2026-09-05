import { describe, expect, it } from 'vitest';
import { traduzirErroNegocioExtra } from './erros-negocio-extra';
import { ErroHttp, erroDeNegocio } from '@/server/http/erros';

describe('traduzirErroNegocioExtra', () => {
  it('repassa um ErroHttp já pronto sem alterar', () => {
    const original = erroDeNegocio('já lançado');
    expect(traduzirErroNegocioExtra(original)).toBe(original);
  });

  it.each([
    ['PLANTAO_INDISPONIVEL'],
    ['CICLO_FECHADO'],
    ['JANELA_NAO_ABERTA'],
    ['JANELA_ENCERRADA'],
    ['COLABORADOR_INATIVO'],
    ['COLABORADOR_BLOQUEADO'],
    ['CRUZADA_BLOQUEADA'],
    ['EM_AUSENCIA'],
    ['CONFLITO_DE_HORARIO'],
    ['EXCEDE_JORNADA'],
    ['LIMITE_ATINGIDO'],
    ['SEM_VAGA'],
  ])('%s vira 409 com o mesmo código', (codigo) => {
    const erro = new Error(codigo);
    const traduzido = traduzirErroNegocioExtra(erro);
    expect(traduzido).toBeInstanceOf(ErroHttp);
    expect(traduzido?.status).toBe(409);
    expect(traduzido?.codigo).toBe(codigo);
    expect(traduzido?.message.length).toBeGreaterThan(0);
  });

  it('casa a mensagem do driver Prisma no formato "Raw query failed... Message: `CODIGO`"', () => {
    const erro = new Error("Raw query failed. Code: `P0001`. Message: `SEM_VAGA`");
    const traduzido = traduzirErroNegocioExtra(erro);
    expect(traduzido?.codigo).toBe('SEM_VAGA');
  });

  it('MARCACAO_INEXISTENTE vira 404 RECURSO_NAO_ENCONTRADO', () => {
    const erro = new Error('MARCACAO_INEXISTENTE');
    const traduzido = traduzirErroNegocioExtra(erro);
    expect(traduzido?.status).toBe(404);
    expect(traduzido?.codigo).toBe('RECURSO_NAO_ENCONTRADO');
  });

  it('erro não reconhecido devolve undefined (chamador relança para o pipeline padrão)', () => {
    expect(traduzirErroNegocioExtra(new Error('erro genérico de infra'))).toBeUndefined();
    expect(traduzirErroNegocioExtra({ code: '23505' })).toBeUndefined();
    expect(traduzirErroNegocioExtra(null)).toBeUndefined();
    expect(traduzirErroNegocioExtra(undefined)).toBeUndefined();
  });
});
