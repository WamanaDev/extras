import { describe, expect, it, vi } from 'vitest';
import { buscarGradePlantoes, type ClientePlantoes } from './plantoes';
import { ErroHttp } from '@/server/http/erros';

const SALDO_LINHA = [{ limite: 5, usadas: 1, restantes: 4, permite_cruzada: true, bloqueado: false, motivo_bloqueio: null }];

function plantaoLinha(overrides: Record<string, unknown> = {}) {
  return {
    plantao_id: 'plantao-1',
    data: new Date('2026-09-04T00:00:00Z'),
    tipo: 'DIURNO',
    rt_codigo: 'RT1',
    hora_inicio: '07:00',
    hora_fim: '19:00',
    vagas_totais: 2,
    vagas_ocupadas: 1,
    ja_marcado: false,
    disponivel: true,
    motivo: null,
    ...overrides,
  };
}

function clienteFake(ciclo: unknown, queryRawSequencia: unknown[][]): ClientePlantoes {
  let chamada = 0;
  const tx = {
    ciclo: { findUnique: vi.fn(async () => ciclo) },
    $queryRaw: vi.fn(async () => queryRawSequencia[chamada++ % queryRawSequencia.length]),
  };
  return {
    $transaction: async (callback: (tx: unknown) => unknown) => callback(tx),
  } as unknown as ClientePlantoes;
}

const CICLO_PUBLICADO = { id: 'ciclo-1', status: 'PUBLICADO' };

describe('buscarGradePlantoes (API-COL-003)', () => {
  it('#1 sem restrição: todos disponíveis', async () => {
    const cliente = clienteFake(CICLO_PUBLICADO, [SALDO_LINHA, [plantaoLinha()]]);
    const resultado = await buscarGradePlantoes(cliente, 'ciclo-1', 'colab-1');
    expect(resultado.plantoes[0]?.disponivel).toBe(true);
    expect(resultado.plantoes[0]?.motivo).toBeNull();
  });

  it('#2 no limite: LIMITE_ATINGIDO', async () => {
    const cliente = clienteFake(CICLO_PUBLICADO, [SALDO_LINHA, [plantaoLinha({ disponivel: false, motivo: 'LIMITE_ATINGIDO' })]]);
    const resultado = await buscarGradePlantoes(cliente, 'ciclo-1', 'colab-1');
    expect(resultado.plantoes[0]?.motivo).toBe('LIMITE_ATINGIDO');
  });

  it('#3 outra RT, cruzada off: CRUZADA_BLOQUEADA, mas visível', async () => {
    const cliente = clienteFake(CICLO_PUBLICADO, [SALDO_LINHA, [plantaoLinha({ disponivel: false, motivo: 'CRUZADA_BLOQUEADA' })]]);
    const resultado = await buscarGradePlantoes(cliente, 'ciclo-1', 'colab-1');
    expect(resultado.plantoes).toHaveLength(1);
    expect(resultado.plantoes[0]?.motivo).toBe('CRUZADA_BLOQUEADA');
  });

  it('#4 mesmo turno da base: CONFLITO_DE_HORARIO', async () => {
    const cliente = clienteFake(CICLO_PUBLICADO, [SALDO_LINHA, [plantaoLinha({ disponivel: false, motivo: 'CONFLITO_DE_HORARIO' })]]);
    const resultado = await buscarGradePlantoes(cliente, 'ciclo-1', 'colab-1');
    expect(resultado.plantoes[0]?.motivo).toBe('CONFLITO_DE_HORARIO');
  });

  it('#5 formaria 36h: EXCEDE_JORNADA', async () => {
    const cliente = clienteFake(CICLO_PUBLICADO, [SALDO_LINHA, [plantaoLinha({ disponivel: false, motivo: 'EXCEDE_JORNADA' })]]);
    const resultado = await buscarGradePlantoes(cliente, 'ciclo-1', 'colab-1');
    expect(resultado.plantoes[0]?.motivo).toBe('EXCEDE_JORNADA');
  });

  it('#6 ciclo em rascunho: 404', async () => {
    const cliente = clienteFake({ id: 'ciclo-1', status: 'RASCUNHO' }, [SALDO_LINHA, [plantaoLinha()]]);
    await expect(buscarGradePlantoes(cliente, 'ciclo-1', 'colab-1')).rejects.toBeInstanceOf(ErroHttp);
    await expect(buscarGradePlantoes(cliente, 'ciclo-1', 'colab-1')).rejects.toMatchObject({ status: 404 });
  });

  it('#7 nome de terceiro no payload: ausente (contrato não expõe nomes)', async () => {
    const cliente = clienteFake(CICLO_PUBLICADO, [SALDO_LINHA, [plantaoLinha()]]);
    const resultado = await buscarGradePlantoes(cliente, 'ciclo-1', 'colab-1');
    expect(JSON.stringify(resultado)).not.toMatch(/nome/i);
  });

  it('ciclo inexistente também é 404, não vaza existência', async () => {
    const cliente = clienteFake(null, [SALDO_LINHA, [plantaoLinha()]]);
    await expect(buscarGradePlantoes(cliente, 'ciclo-x', 'colab-1')).rejects.toMatchObject({ status: 404 });
  });
});
