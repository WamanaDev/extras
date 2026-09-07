/**
 * Testes de `buscarVizinhosCiclos` — pedido do usuário: navegação de mês em
 * `/plantoes-calendario`/`/minha-escala-calendario` só entre ciclos
 * PUBLICADO ("ciclo fechado é ciclo cancelado, não serve pra nada").
 */
import { describe, expect, it } from 'vitest';
import { buscarVizinhosCiclos, type ClienteCiclosVizinhos } from './ciclos-vizinhos';

const AGORA = new Date('2026-09-15T12:00:00-03:00');

function clienteFake(ciclos: unknown[]): ClienteCiclosVizinhos {
  return { ciclo: { findMany: async () => ciclos } } as unknown as ClienteCiclosVizinhos;
}

function ciclo(ano: number, mes: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `ciclo-${ano}-${mes}`,
    ano,
    mes,
    aberturaMarcacao: null,
    fechamentoMarcacao: null,
    permiteCruzada: false,
    ...overrides,
  };
}

describe('buscarVizinhosCiclos', () => {
  it('mês com ciclo publicado exato → atual preenchido, vizinhos corretos', async () => {
    const prisma = clienteFake([ciclo(2026, 7), ciclo(2026, 8), ciclo(2026, 9), ciclo(2026, 10)]);
    const resultado = await buscarVizinhosCiclos(prisma, 2026, 9, AGORA);

    expect(resultado.atual?.id).toBe('ciclo-2026-9');
    expect(resultado.anterior?.id).toBe('ciclo-2026-8');
    expect(resultado.proximo?.id).toBe('ciclo-2026-10');
  });

  it('mês sem ciclo publicado → atual null, mas anterior/próximo ainda resolvem (não trava a navegação)', async () => {
    const prisma = clienteFake([ciclo(2026, 8), ciclo(2026, 10)]);
    const resultado = await buscarVizinhosCiclos(prisma, 2026, 9, AGORA);

    expect(resultado.atual).toBeNull();
    expect(resultado.anterior?.id).toBe('ciclo-2026-8');
    expect(resultado.proximo?.id).toBe('ciclo-2026-10');
  });

  it('pula ciclo FECHADO/RASCUNHO (nunca aparecem — filtrados na própria query por status=PUBLICADO)', async () => {
    // O fake já simula o efeito do `where: { status: 'PUBLICADO' }` — só
    // devolve os PUBLICADO. O ciclo de agosto (FECHADO na vida real) nunca
    // chega até a função, então "anterior" pula direto para julho.
    const prisma = clienteFake([ciclo(2026, 7), ciclo(2026, 9)]);
    const resultado = await buscarVizinhosCiclos(prisma, 2026, 9, AGORA);

    expect(resultado.anterior?.id).toBe('ciclo-2026-7');
  });

  it('virada de ano (dezembro → janeiro) — ordenação por (ano,mes) não quebra', async () => {
    const prisma = clienteFake([ciclo(2025, 12), ciclo(2026, 1), ciclo(2026, 2)]);
    const resultado = await buscarVizinhosCiclos(prisma, 2026, 1, AGORA);

    expect(resultado.atual?.id).toBe('ciclo-2026-1');
    expect(resultado.anterior?.id).toBe('ciclo-2025-12');
    expect(resultado.proximo?.id).toBe('ciclo-2026-2');
  });

  it('nenhum ciclo publicado → tudo null, sem lançar', async () => {
    const prisma = clienteFake([]);
    const resultado = await buscarVizinhosCiclos(prisma, 2026, 9, AGORA);
    expect(resultado).toEqual({ anterior: null, atual: null, proximo: null, servidorEm: AGORA.toISOString() });
  });

  it('primeiro ciclo da história → anterior null, proximo preenchido', async () => {
    const prisma = clienteFake([ciclo(2026, 9), ciclo(2026, 10)]);
    const resultado = await buscarVizinhosCiclos(prisma, 2026, 9, AGORA);
    expect(resultado.anterior).toBeNull();
    expect(resultado.proximo?.id).toBe('ciclo-2026-10');
  });

  it('último ciclo publicado → proximo null, anterior preenchido', async () => {
    const prisma = clienteFake([ciclo(2026, 8), ciclo(2026, 9)]);
    const resultado = await buscarVizinhosCiclos(prisma, 2026, 9, AGORA);
    expect(resultado.proximo).toBeNull();
    expect(resultado.anterior?.id).toBe('ciclo-2026-8');
  });

  it('janela do ciclo é calculada contra `agora` injetado, mesma lógica de calcularEstadoJanela', async () => {
    const prisma = clienteFake([
      ciclo(2026, 9, { aberturaMarcacao: new Date('2026-09-01T00:00:00-03:00'), fechamentoMarcacao: new Date('2026-09-10T23:59:59-03:00') }),
    ]);
    const resultado = await buscarVizinhosCiclos(prisma, 2026, 9, AGORA);
    expect(resultado.atual?.janela.estado).toBe('ENCERRADA'); // AGORA é 15/09, depois do fechamento em 10/09.
  });
});
