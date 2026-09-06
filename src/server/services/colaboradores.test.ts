/**
 * `hojeCivilSaoPaulo` — regressão do bug relatado pelo usuário: trocar-escala
 * recusando uma vigência de "hoje" como retroativa perto da meia-noite UTC
 * (que já é o dia seguinte em Brasília, UTC-3).
 */
import { describe, expect, it } from 'vitest';
import { hojeCivilSaoPaulo, parseDataCivil, formatarDataCivil } from './colaboradores';

describe('hojeCivilSaoPaulo', () => {
  it('01:00 UTC (22h de ontem em Brasília) ainda é o dia civil anterior', () => {
    const agora = new Date('2026-09-07T01:00:00.000Z');
    expect(formatarDataCivil(hojeCivilSaoPaulo(agora))).toBe('2026-09-06');
  });

  it('12:00 UTC (09h em Brasília) já é o dia civil corrente', () => {
    const agora = new Date('2026-09-07T12:00:00.000Z');
    expect(formatarDataCivil(hojeCivilSaoPaulo(agora))).toBe('2026-09-07');
  });

  it('vigência de "hoje" (Brasília) não deve parecer retroativa mesmo às 23h59 de Brasília', () => {
    // 23:59 em Brasília (UTC-3) no dia 06/09 = 02:59 UTC do dia 07/09.
    const agora = new Date('2026-09-07T02:59:00.000Z');
    const hoje = hojeCivilSaoPaulo(agora);
    const vigenciaHojeBrasilia = parseDataCivil('2026-09-06');
    expect(vigenciaHojeBrasilia).not.toBeNull();
    expect((vigenciaHojeBrasilia as Date).getTime() >= hoje.getTime()).toBe(true);
  });
});
