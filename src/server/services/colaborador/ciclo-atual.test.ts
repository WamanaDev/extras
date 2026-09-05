import { describe, expect, it } from 'vitest';
import { buscarCicloAtual, calcularEstadoJanela, type ClienteCicloAtual } from './ciclo-atual';

const AGORA = new Date('2026-09-03T12:00:00-03:00');

function clienteFake(ciclo: unknown): ClienteCicloAtual {
  return { ciclo: { findFirst: async () => ciclo } } as unknown as ClienteCicloAtual;
}

const CICLO_BASE = {
  id: 'ciclo-1',
  ano: 2026,
  mes: 9,
  status: 'PUBLICADO',
  permiteCruzada: true,
  aberturaMarcacao: new Date('2026-09-01T00:00:00-03:00'),
  fechamentoMarcacao: new Date('2026-09-10T23:59:59-03:00'),
};

describe('calcularEstadoJanela', () => {
  it('ANTES da abertura', () => {
    expect(calcularEstadoJanela(new Date('2026-09-05'), new Date('2026-09-10'), new Date('2026-09-01'))).toBe('ANTES');
  });
  it('ABERTA dentro da janela', () => {
    expect(calcularEstadoJanela(new Date('2026-09-01'), new Date('2026-09-10'), new Date('2026-09-05'))).toBe('ABERTA');
  });
  it('ENCERRADA após o fechamento', () => {
    expect(calcularEstadoJanela(new Date('2026-09-01'), new Date('2026-09-10'), new Date('2026-09-15'))).toBe('ENCERRADA');
  });
  it('sem limites definidos, sempre ABERTA', () => {
    expect(calcularEstadoJanela(null, null, new Date())).toBe('ABERTA');
  });
});

describe('buscarCicloAtual (API-COL-001, teste #1-5)', () => {
  it('#1 janela aberta', async () => {
    const resultado = await buscarCicloAtual(clienteFake(CICLO_BASE), AGORA);
    expect(resultado?.janela.estado).toBe('ABERTA');
  });

  it('#2 antes da abertura', async () => {
    const ciclo = { ...CICLO_BASE, aberturaMarcacao: new Date('2026-09-04T00:00:00-03:00') };
    const resultado = await buscarCicloAtual(clienteFake(ciclo), AGORA);
    expect(resultado?.janela.estado).toBe('ANTES');
  });

  it('#3 após o fechamento', async () => {
    const ciclo = { ...CICLO_BASE, fechamentoMarcacao: new Date('2026-09-02T00:00:00-03:00') };
    const resultado = await buscarCicloAtual(clienteFake(ciclo), AGORA);
    expect(resultado?.janela.estado).toBe('ENCERRADA');
  });

  it('#4 só ciclo em rascunho (findFirst filtra por PUBLICADO) → null', async () => {
    const resultado = await buscarCicloAtual(clienteFake(null), AGORA);
    expect(resultado).toBeNull();
  });

  it('#5 servidorEm reflete `agora` injetado, não o relógio local — estado não muda com "relógio do cliente"', async () => {
    const resultado = await buscarCicloAtual(clienteFake(CICLO_BASE), AGORA);
    expect(resultado?.servidorEm).toBe(AGORA.toISOString());
    expect(resultado?.janela.estado).toBe('ABERTA');
  });

  it('não vaza limites de terceiros nem contagem global — resposta só tem os campos do contrato', async () => {
    const resultado = await buscarCicloAtual(clienteFake(CICLO_BASE), AGORA);
    expect(Object.keys(resultado ?? {}).sort()).toEqual(['ano', 'id', 'janela', 'mes', 'permiteCruzada', 'servidorEm'].sort());
  });
});
