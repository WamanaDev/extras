/**
 * Testes de aceitação de `specs/04-api/colaborador/API-COL-007-saldo.md`.
 */
import { describe, expect, it, vi } from 'vitest';
import { buscarMeuSaldo, type ClienteSaldo } from './saldo';

function criarPrismaFake(config: {
  ciclo?: { id: string } | null;
  saldo?: Partial<{
    limite: number;
    usadas: number;
    restantes: number;
    permite_cruzada: boolean;
    bloqueado: boolean;
    motivo_bloqueio: string | null;
  }>;
}): ClienteSaldo {
  return {
    ciclo: {
      findUnique: vi.fn(async () => (config.ciclo === undefined ? { id: 'ciclo-1' } : config.ciclo)),
    } as unknown as ClienteSaldo['ciclo'],
    $queryRaw: vi.fn(async () => [
      {
        limite: 5,
        usadas: 2,
        restantes: 3,
        permite_cruzada: false,
        bloqueado: false,
        motivo_bloqueio: null,
        ...config.saldo,
      },
    ]) as unknown as ClienteSaldo['$queryRaw'],
  };
}

describe('API-COL-007 buscarMeuSaldo', () => {
  it('1. sem override — usa limitePadrao (refletido pela própria saldo_colaborador, valor repassado tal qual)', async () => {
    const prisma = criarPrismaFake({ saldo: { limite: 5, usadas: 0, restantes: 5 } });
    const resultado = await buscarMeuSaldo(prisma, 'colab-1', 'ciclo-1');
    expect(resultado.limite).toBe(5);
  });

  it('2. com override — o valor de saldo_colaborador já reflete o override; serviço só repassa', async () => {
    const prisma = criarPrismaFake({ saldo: { limite: 8, usadas: 1, restantes: 7 } });
    const resultado = await buscarMeuSaldo(prisma, 'colab-1', 'ciclo-1');
    expect(resultado.limite).toBe(8);
  });

  it('3. limite reduzido abaixo do usado → restantes = 0 (GREATEST já aplicado na função)', async () => {
    const prisma = criarPrismaFake({ saldo: { limite: 2, usadas: 5, restantes: 0 } });
    const resultado = await buscarMeuSaldo(prisma, 'colab-1', 'ciclo-1');
    expect(resultado.restantes).toBe(0);
  });

  it('4. bloqueado = true + motivo', async () => {
    const prisma = criarPrismaFake({ saldo: { bloqueado: true, motivo_bloqueio: 'Excesso de faltas' } });
    const resultado = await buscarMeuSaldo(prisma, 'colab-1', 'ciclo-1');
    expect(resultado.bloqueado).toBe(true);
    expect(resultado.motivoBloqueio).toBe('Excesso de faltas');
  });

  it('5. canceladas não contam em usadas — já garantido por saldo_colaborador (status = CONFIRMADA no filtro); serviço só repassa o valor', async () => {
    const prisma = criarPrismaFake({ saldo: { usadas: 2 } });
    const resultado = await buscarMeuSaldo(prisma, 'colab-1', 'ciclo-1');
    expect(resultado.usadas).toBe(2);
  });

  it('mapeia permite_cruzada (snake_case do banco) para permiteCruzada (camelCase do contrato)', async () => {
    const prisma = criarPrismaFake({ saldo: { permite_cruzada: true } });
    const resultado = await buscarMeuSaldo(prisma, 'colab-1', 'ciclo-1');
    expect(resultado.permiteCruzada).toBe(true);
  });

  it('ciclo inexistente → 404 RECURSO_NAO_ENCONTRADO (recurso de terceiro/inexistente, contrato-comum.md)', async () => {
    const prisma = criarPrismaFake({ ciclo: null });
    await expect(buscarMeuSaldo(prisma, 'colab-1', 'ciclo-inexistente')).rejects.toMatchObject({
      status: 404,
      codigo: 'RECURSO_NAO_ENCONTRADO',
    });
  });
});
