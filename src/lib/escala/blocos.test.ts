/**
 * DOM-002 — Testes de aceitação de `blocos.ts`, tabela de
 * `01-dominio/blocos-jornada.md`.
 *
 * Convenção dos testes: D1/D2/D3 são dias consecutivos de calendário (UTC,
 * sem componente de fuso — `blocoDoTurno` já resolve America/Sao_Paulo
 * internamente a partir da data civil).
 */
import { describe, expect, it } from 'vitest';
import { blocoDoTurno, validaDescanso, type Bloco } from './blocos';

function dia(offset: number): Date {
  // D1 = 2026-09-01, D2 = 2026-09-02, D3 = 2026-09-03 ...
  return new Date(Date.UTC(2026, 8, 1 + offset));
}

const D1 = dia(0);
const D2 = dia(1);
const D3 = dia(2);

describe('DOM-002 validaDescanso — tabela de testes de aceitação', () => {
  it('Extra noturno D2, base noturno D2 → CONFLITO_DE_HORARIO', () => {
    const baseNoturnoD2 = blocoDoTurno(D2, 'NOTURNO');
    const extraNoturnoD2 = blocoDoTurno(D2, 'NOTURNO');
    expect(validaDescanso([baseNoturnoD2], extraNoturnoD2, 2)).toBe('CONFLITO_DE_HORARIO');
  });

  it('Extra diurno D2, base noturno D2 → permitido', () => {
    const baseNoturnoD2 = blocoDoTurno(D2, 'NOTURNO');
    const extraDiurnoD2 = blocoDoTurno(D2, 'DIURNO');
    expect(validaDescanso([baseNoturnoD2], extraDiurnoD2, 2)).toBeNull();
  });

  it('Extra diurno D3, base noturno D2 → permitido', () => {
    const baseNoturnoD2 = blocoDoTurno(D2, 'NOTURNO');
    const extraDiurnoD3 = blocoDoTurno(D3, 'DIURNO');
    expect(validaDescanso([baseNoturnoD2], extraDiurnoD3, 2)).toBeNull();
  });

  it('Extra diurno D3, base noturno D2 + extra diurno D2 → EXCEDE_JORNADA', () => {
    const baseNoturnoD2 = blocoDoTurno(D2, 'NOTURNO');
    const extraDiurnoD2 = blocoDoTurno(D2, 'DIURNO');
    const extraDiurnoD3 = blocoDoTurno(D3, 'DIURNO');
    expect(validaDescanso([baseNoturnoD2, extraDiurnoD2], extraDiurnoD3, 2)).toBe('EXCEDE_JORNADA');
  });

  it('Extra em dia com FT → EXCEDE_JORNADA (FT ocupaHorario mesmo sem presença)', () => {
    // FT em D2 (noturno) ocupa o intervalo exatamente como um bloco de escala base
    // ocuparia — a distinção presenca/ocupaHorario é resolvida por quem monta a
    // lista de blocos (DOM-003), não por validaDescanso, que só enxerga intervalos.
    const ftD2Noturno = blocoDoTurno(D2, 'NOTURNO');
    const extraDiurnoD2 = blocoDoTurno(D2, 'DIURNO');
    const extraDiurnoD3 = blocoDoTurno(D3, 'DIURNO');
    expect(validaDescanso([ftD2Noturno, extraDiurnoD2], extraDiurnoD3, 2)).toBe('EXCEDE_JORNADA');
  });

  it('Extra em dia com F → passa na jornada (F não ocupaHorario, não entra na lista de blocos)', () => {
    const extraDiurnoD2 = blocoDoTurno(D2, 'DIURNO');
    // F não gera bloco (presenca=false, ocupaHorario=false) — lista vazia.
    expect(validaDescanso([], extraDiurnoD2, 2)).toBeNull();
  });

  it('Blocos com 1h de intervalo → não são contíguos, não somam cadeia', () => {
    const baseNoturnoD1 = blocoDoTurno(D1, 'NOTURNO'); // termina 07:00 D2 (UTC-3)
    const comGap: Bloco = {
      inicio: new Date(+baseNoturnoD1.fim + 60 * 60 * 1000), // 1h depois do fim
      fim: new Date(+baseNoturnoD1.fim + 60 * 60 * 1000 + 12 * 60 * 60 * 1000),
    };
    expect(validaDescanso([baseNoturnoD1], comGap, 2)).toBeNull();

    // Mesmo com um terceiro bloco imediatamente após o gap, a cadeia reinicia no
    // gap — não deve exceder jornada com apenas 2 contíguos após a quebra.
    const terceiroContiguoAoGap: Bloco = { inicio: comGap.fim, fim: new Date(+comGap.fim + 12 * 60 * 60 * 1000) };
    expect(validaDescanso([baseNoturnoD1, comGap], terceiroContiguoAoGap, 2)).toBeNull();
  });

  it('1000 cenários aleatórios TS vs SQL — não coberto aqui (depende de FN-004 em SQL, Onda 1 03-banco ainda não implementada; ver 07-testes/paridade-escala.md TST-003)', () => {
    expect(true).toBe(true);
  });
});

describe('DOM-002 blocoDoTurno — modelagem [inicio, fim)', () => {
  it('DIURNO em D: 07:00 → 19:00 America/Sao_Paulo (UTC-3 fixo)', () => {
    const b = blocoDoTurno(D2, 'DIURNO');
    expect(b.inicio.toISOString()).toBe('2026-09-02T10:00:00.000Z');
    expect(b.fim.toISOString()).toBe('2026-09-02T22:00:00.000Z');
  });

  it('NOTURNO em D: 19:00 D → 07:00 D+1, contíguo com o diurno seguinte', () => {
    const noturnoD2 = blocoDoTurno(D2, 'NOTURNO');
    const diurnoD3 = blocoDoTurno(D3, 'DIURNO');
    expect(+noturnoD2.fim).toBe(+diurnoD3.inicio);
  });

  it('diurno e noturno do mesmo dia são contíguos, não sobrepostos', () => {
    const diurnoD2 = blocoDoTurno(D2, 'DIURNO');
    const noturnoD2 = blocoDoTurno(D2, 'NOTURNO');
    expect(+diurnoD2.fim).toBe(+noturnoD2.inicio);
    expect(validaDescanso([diurnoD2], noturnoD2, 2)).toBeNull();
  });
});
