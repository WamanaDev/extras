/**
 * DOM-001 — Testes de aceitação de `ancora.ts`, tabela de
 * `01-dominio/escala-12x36.md`.
 */
import { describe, expect, it } from 'vitest';
import { ancoraVigente, diasDoMes, letraDiaSemana, previewMeses, trabalhaEm, type TrocaEscala } from './ancora';

function utc(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function diasEsperados(datas: Date[]): number[] {
  return datas.map((d) => d.getUTCDate());
}

describe('DOM-001 trabalhaEm / diasDoMes — âncora 2026-08-01', () => {
  const ancora = utc(2026, 8, 1);

  it('ago/2026: ímpares 1,3,...,31', () => {
    expect(diasEsperados(diasDoMes(ancora, 2, 2026, 8))).toEqual(
      [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31],
    );
  });

  it('set/2026: pares 2,4,...,30 (a paridade vira sozinha)', () => {
    expect(diasEsperados(diasDoMes(ancora, 2, 2026, 9))).toEqual(
      [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
    );
  });

  it('out/2026: pares 2,4,...,30', () => {
    expect(diasEsperados(diasDoMes(ancora, 2, 2026, 10))).toEqual(
      [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
    );
  });

  it('nov/2026: ímpares 1,3,...,29', () => {
    expect(diasEsperados(diasDoMes(ancora, 2, 2026, 11))).toEqual(
      [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29],
    );
  });
});

describe('DOM-001 fevereiro bissexto', () => {
  it('âncora 2028-02-01: fev tem 1,3,...,29 e março começa em 2', () => {
    const ancora = utc(2028, 2, 1);
    expect(diasEsperados(diasDoMes(ancora, 2, 2028, 2))).toEqual(
      [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29],
    );
    expect(diasEsperados(diasDoMes(ancora, 2, 2028, 3))[0]).toBe(2);
  });
});

describe('DOM-001 data anterior à âncora', () => {
  it('mod negativo tratado sem exceção', () => {
    const ancora = utc(2026, 8, 15);
    expect(() => trabalhaEm(utc(2026, 8, 1), ancora, 2)).not.toThrow();
    // 14 dias antes da âncora: diferença -14, par → trabalha.
    expect(trabalhaEm(utc(2026, 8, 1), ancora, 2)).toBe(true);
    // 13 dias antes: diferença -13, ímpar → não trabalha.
    expect(trabalhaEm(utc(2026, 8, 2), ancora, 2)).toBe(false);
  });
});

describe('DOM-001 ancoraVigente — troca de escala', () => {
  it('dias 1-14 pela âncora antiga, 15-30 pela nova (troca vigente a partir de 15/09)', () => {
    const colaborador = {
      escalaAncora: utc(2026, 8, 1),
      escalaPeriodo: 2,
      turnoPadrao: 'NOTURNO' as const,
    };
    const trocas: TrocaEscala[] = [
      {
        vigenciaInicio: utc(2026, 9, 15),
        turno: 'DIURNO',
        ancora: utc(2026, 9, 15),
        periodo: 2,
      },
    ];

    const antes = ancoraVigente(colaborador, trocas, utc(2026, 9, 14));
    expect(+antes.ancora).toBe(+colaborador.escalaAncora);
    expect(antes.turno).toBe('NOTURNO');

    const depois = ancoraVigente(colaborador, trocas, utc(2026, 9, 15));
    expect(+depois.ancora).toBe(+trocas[0]!.ancora);
    expect(depois.turno).toBe('DIURNO');

    const bemDepois = ancoraVigente(colaborador, trocas, utc(2026, 9, 30));
    expect(+bemDepois.ancora).toBe(+trocas[0]!.ancora);
  });

  it('escalas de meses anteriores permanecem intactas (não há troca aplicável)', () => {
    const colaborador = {
      escalaAncora: utc(2026, 8, 1),
      escalaPeriodo: 2,
      turnoPadrao: 'DIURNO' as const,
    };
    const trocas: TrocaEscala[] = [
      { vigenciaInicio: utc(2026, 9, 15), turno: 'NOTURNO', ancora: utc(2026, 9, 15), periodo: 2 },
    ];
    const resolvida = ancoraVigente(colaborador, trocas, utc(2026, 7, 20));
    expect(+resolvida.ancora).toBe(+colaborador.escalaAncora);
    expect(resolvida.turno).toBe('DIURNO');
  });
});

describe('DOM-001 periodo = 3', () => {
  it('funciona sem alteração de código: trabalha a cada 3 dias', () => {
    const ancora = utc(2026, 8, 1);
    expect(diasEsperados(diasDoMes(ancora, 3, 2026, 8))).toEqual([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31]);
  });
});

describe('DOM-001 previewMeses', () => {
  it('rótulo de paridade é só UI e não influencia diasDoMes', () => {
    const ancora = utc(2026, 8, 1);
    const preview = previewMeses(ancora, 2, 2026, 8, 4);
    expect(preview).toHaveLength(4);
    expect(preview[0]).toMatchObject({ ano: 2026, mes: 8, paridade: 'IMPAR' });
    expect(preview[1]).toMatchObject({ ano: 2026, mes: 9, paridade: 'PAR' });
    // paridade não deve ser usada por diasDoMes — reconferimos os dias batem com o teste direto.
    expect(diasEsperados(diasDoMes(ancora, 2, 2026, 8))).toEqual(preview[0]!.dias);
  });
});

describe('letraDiaSemana — abreviação D S T Q Q S S (pedido do usuário: letra do dia da semana em cima do número na grade)', () => {
  it('setembro/2026 começa numa terça — sequência T Q Q S S D S bate com a convenção de planilha de escala', () => {
    expect(letraDiaSemana(2026, 9, 1)).toBe('T'); // terça
    expect(letraDiaSemana(2026, 9, 2)).toBe('Q'); // quarta
    expect(letraDiaSemana(2026, 9, 3)).toBe('Q'); // quinta
    expect(letraDiaSemana(2026, 9, 4)).toBe('S'); // sexta
    expect(letraDiaSemana(2026, 9, 5)).toBe('S'); // sábado
    expect(letraDiaSemana(2026, 9, 6)).toBe('D'); // domingo
    expect(letraDiaSemana(2026, 9, 7)).toBe('S'); // segunda
    expect(letraDiaSemana(2026, 9, 8)).toBe('T'); // terça de novo — ciclo de 7 completo
  });
});
