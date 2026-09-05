/**
 * Testes de `simularCoberturaAposTroca`/`coberturaAntesComoImpacto` — usados
 * por `API-ADM-ESC-002` (impacto de um dia) e `API-ADM-ESC-003` (impacto
 * agregado de um lote). Função pura, sem I/O — cobre o "ponto sutil" da
 * simulação: o delta de `total` é sempre ±1 conforme a mudança de `presenca`
 * (DOM-003.4), nunca reconsulta `FN-009`.
 */
import { describe, expect, it } from 'vitest';
import { coberturaAntesComoImpacto, simularCoberturaAposTroca, type CoberturaDia } from './cobertura';

const BASE: CoberturaDia = { rt: 'RT-A', turno: 'DIURNO', total: 5, minimo: 5 };

describe('simularCoberturaAposTroca', () => {
  it('D (presença) → F (ausência): total cai 1, déficit passa a existir se cruzar o mínimo', () => {
    const resultado = simularCoberturaAposTroca(BASE, true, false);
    expect(resultado.total).toBe(4);
    expect(resultado.deficit).toBe(1);
  });

  it('F (ausência) → D (presença): total sobe 1, sem déficit', () => {
    const resultado = simularCoberturaAposTroca({ ...BASE, total: 4 }, false, true);
    expect(resultado.total).toBe(5);
    expect(resultado.deficit).toBe(0);
  });

  it('mesma presença antes/depois (ex.: F → FT, ambos ausência): total não muda', () => {
    const resultado = simularCoberturaAposTroca(BASE, false, false);
    expect(resultado.total).toBe(5);
  });

  it('déficit nunca é negativo (total acima do mínimo)', () => {
    const resultado = simularCoberturaAposTroca({ ...BASE, total: 8, minimo: 5 }, true, false);
    expect(resultado.total).toBe(7);
    expect(resultado.deficit).toBe(0);
  });
});

describe('coberturaAntesComoImpacto', () => {
  it('anexa deficit ao estado atual, sem simular troca', () => {
    expect(coberturaAntesComoImpacto({ rt: 'RT-A', turno: 'DIURNO', total: 3, minimo: 5 })).toEqual({
      rt: 'RT-A',
      turno: 'DIURNO',
      total: 3,
      minimo: 5,
      deficit: 2,
    });
  });
});
