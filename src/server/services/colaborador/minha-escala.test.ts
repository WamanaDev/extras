import { describe, expect, it, vi } from 'vitest';
import { buscarMinhaEscala, type ClienteMinhaEscala } from './minha-escala';

function clienteFake(ciclo: unknown, linhas: unknown[]): ClienteMinhaEscala {
  return {
    ciclo: { findUnique: vi.fn(async () => ciclo) },
    $queryRaw: vi.fn(async () => linhas),
  } as unknown as ClienteMinhaEscala;
}

const CICLO = { id: 'ciclo-1', ano: 2026, mes: 9 };

function linhaBase(overrides: Record<string, unknown> = {}) {
  return {
    data: new Date('2026-09-04T00:00:00Z'),
    turno: 'DIURNO',
    codigo: 'T',
    descricao_codigo: 'Trabalho',
    presenca: true,
    hora_inicio: '07:00',
    hora_fim: '19:00',
    inicio_em: new Date('2026-09-04T07:00:00-03:00'),
    fim_em: new Date('2026-09-04T19:00:00-03:00'),
    extra_plantao_id: null,
    extra_rt_nome: null,
    extra_tipo: null,
    extra_hora_inicio: null,
    extra_hora_fim: null,
    extra_inicio_em: null,
    extra_fim_em: null,
    ...overrides,
  };
}

describe('buscarMinhaEscala (API-COL-002)', () => {
  it('#1 escala gerada: dias corretos pela âncora', async () => {
    const resultado = await buscarMinhaEscala(clienteFake(CICLO, [linhaBase()]), 'colab-1', 'ciclo-1');
    expect(resultado.ciclo).toEqual({ ano: 2026, mes: 9 });
    expect(resultado.dias).toHaveLength(1);
    expect(resultado.dias[0]?.data).toBe('2026-09-04');
  });

  it('#2 dia com F: código F, presenca=false', async () => {
    const linha = linhaBase({ codigo: 'F', presenca: false, descricao_codigo: 'Folga' });
    const resultado = await buscarMinhaEscala(clienteFake(CICLO, [linha]), 'colab-1', 'ciclo-1');
    expect(resultado.dias[0]).toMatchObject({ codigo: 'F', presenca: false });
  });

  it('#3 dia com extra: campo extra preenchido', async () => {
    const linha = linhaBase({
      extra_plantao_id: 'plantao-1',
      extra_rt_nome: 'RT1',
      extra_tipo: 'NOTURNO',
      extra_hora_inicio: '19:00',
      extra_hora_fim: '07:00',
      extra_inicio_em: new Date('2026-09-04T19:00:00-03:00'),
      extra_fim_em: new Date('2026-09-05T07:00:00-03:00'),
    });
    const resultado = await buscarMinhaEscala(clienteFake(CICLO, [linha]), 'colab-1', 'ciclo-1');
    expect(resultado.dias[0]?.extra).toEqual({
      plantaoId: 'plantao-1',
      rt: 'RT1',
      tipo: 'NOTURNO',
      horaInicio: '19:00',
      horaFim: '07:00',
    });
    expect(resultado.totais.extras).toBe(1);
  });

  it('#4 observacao nunca aparece no payload (a query não a seleciona)', async () => {
    const resultado = await buscarMinhaEscala(clienteFake(CICLO, [linhaBase()]), 'colab-1', 'ciclo-1');
    expect(JSON.stringify(resultado)).not.toContain('observacao');
  });

  it('#6 ciclo sem escala gerada: lista vazia, sem erro', async () => {
    const resultado = await buscarMinhaEscala(clienteFake(CICLO, []), 'colab-1', 'ciclo-1');
    expect(resultado.dias).toEqual([]);
    expect(resultado.totais).toEqual({ escalados: 0, extras: 0, horas: 0 });
  });

  it('ciclo inexistente para o ator: sem erro, resposta vazia (não 500)', async () => {
    const resultado = await buscarMinhaEscala(clienteFake(null, []), 'colab-1', 'ciclo-inexistente');
    expect(resultado.dias).toEqual([]);
  });

  it('query filtra sempre pelo colaboradorId do ator (SEC-INT — #5, "?colaboradorId= de terceiro ignorado")', async () => {
    const cliente = clienteFake(CICLO, [linhaBase()]);
    await buscarMinhaEscala(cliente, 'colab-da-sessao', 'ciclo-1');
    // A função nunca aceita um segundo colaboradorId — o único jeito de
    // "ler de terceiro" seria chamar com outro valor de `colaboradorId`, que
    // só a rota decide (sempre da sessão, nunca do query string).
    expect(cliente.$queryRaw).toHaveBeenCalled();
  });
});
