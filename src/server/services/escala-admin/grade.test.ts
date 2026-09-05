/**
 * Testes de `montarGrade`/`removerObservacoes` — montagem em memória da
 * matriz colaboradores × dias, `API-ADM-ESC-001`. Cobre da tabela "Testes de
 * aceitação": #1 (matriz completa), #3 (dia sem escala ausente do mapa, não
 * `null`), #4 (`observacao` presente para admin) e uma aproximação de #5
 * (80×31 células, montagem em memória < 500ms — a consulta ao banco em si é
 * responsabilidade de `consulta.test.ts`). `removerObservacoes` cobre a
 * metade de `API-ADM-ESC-004` #3 ("`observacao` no PDF: ausente") que é
 * responsabilidade deste módulo (a outra metade, "gerarPdf nunca recebe
 * observacao", é coberta em `export.test.ts`/rota).
 */
import { describe, expect, it } from 'vitest';
import {
  chaveExtra,
  montarGrade,
  removerObservacoes,
  type ColaboradorGradeEntrada,
  type LinhaEscalaGradeEntrada,
} from './grade';

const CICLO = { ano: 2026, mes: 9, dias: 30 };

// Ana trabalha no dia 1 (ímpar) do ciclo; Bruno no dia 2 (par) — âncoras escolhidas pra bater com o `CICLO` de setembro/2026 acima.
const COLAB_A: ColaboradorGradeEntrada = { id: 'c1', nome: 'Ana', matricula: '0001', rt: 'RT-A', turnoPadrao: 'DIURNO', escalaAncora: new Date(Date.UTC(2026, 8, 1)), escalaPeriodo: 2 };
const COLAB_B: ColaboradorGradeEntrada = { id: 'c2', nome: 'Bruno', matricula: '0002', rt: 'RT-B', turnoPadrao: 'NOTURNO', escalaAncora: new Date(Date.UTC(2026, 8, 2)), escalaPeriodo: 2 };

function linha(overrides: Partial<LinhaEscalaGradeEntrada> & Pick<LinhaEscalaGradeEntrada, 'colaboradorId' | 'dia'>): LinhaEscalaGradeEntrada {
  return {
    escalaDiaId: `${overrides.colaboradorId}-${overrides.dia}`,
    codigo: 'D',
    presenca: true,
    ocupaHorario: true,
    observacao: null,
    ...overrides,
  };
}

describe('montarGrade — API-ADM-ESC-001', () => {
  it('1. ciclo com escala: matriz completa por colaborador, com totais', () => {
    const grade = montarGrade({
      ciclo: CICLO,
      colaboradores: [COLAB_A, COLAB_B],
      linhas: [
        linha({ colaboradorId: 'c1', dia: 1, codigo: 'D', presenca: true }),
        linha({ colaboradorId: 'c1', dia: 2, codigo: 'F', presenca: false, ocupaHorario: false }),
        linha({ colaboradorId: 'c2', dia: 1, codigo: 'D', presenca: true }),
      ],
      diasComExtraConfirmada: new Map(),
      codigos: [],
      cobertura: [],
    });

    expect(grade.colaboradores).toHaveLength(2);
    const ana = grade.colaboradores.find((c) => c.id === 'c1')!;
    expect(ana.dias[1]).toMatchObject({ codigo: 'D' });
    expect(ana.dias[2]).toMatchObject({ codigo: 'F' });
    expect(ana.totais).toEqual({ trabalhados: 1, folgas: 1, extras: 0, horas: 12 });
  });

  it('3. dia sem escala fica ausente do mapa `dias` — não é `null`', () => {
    const grade = montarGrade({
      ciclo: CICLO,
      colaboradores: [COLAB_A],
      linhas: [linha({ colaboradorId: 'c1', dia: 1 })],
      diasComExtraConfirmada: new Map(),
      codigos: [],
      cobertura: [],
    });

    const ana = grade.colaboradores[0]!;
    expect(1 in ana.dias).toBe(true);
    expect(2 in ana.dias).toBe(false);
    expect(ana.dias[2]).toBeUndefined();
  });

  it('4. `observacao` presente na célula quando a linha traz observação (visão admin)', () => {
    const grade = montarGrade({
      ciclo: CICLO,
      colaboradores: [COLAB_A],
      linhas: [linha({ colaboradorId: 'c1', dia: 5, observacao: 'Atestado médico' })],
      diasComExtraConfirmada: new Map(),
      codigos: [],
      cobertura: [],
    });

    expect(grade.colaboradores[0]!.dias[5]!.observacao).toBe('Atestado médico');
  });

  it('temExtra marcado a partir do conjunto de extras confirmadas, e contabilizado nos totais', () => {
    const grade = montarGrade({
      ciclo: CICLO,
      colaboradores: [COLAB_A],
      linhas: [linha({ colaboradorId: 'c1', dia: 3, codigo: 'F', presenca: false, ocupaHorario: false })],
      diasComExtraConfirmada: new Map([[chaveExtra('c1', 3), { turno: 'DIURNO', rt: 'RT-A' }]]),
      codigos: [],
      cobertura: [],
    });

    const ana = grade.colaboradores[0]!;
    expect(ana.dias[3]!.temExtra).toBe(true);
    expect(ana.totais.extras).toBe(1);
    // horas conta trabalhados + extras, mesmo em dia de folga com extra.
    expect(ana.totais.horas).toBe(12);
  });

  it('extra cruzada de RT: `extraRt` reflete a RT do PLANTÃO coberto, não a RT do colaborador', () => {
    const grade = montarGrade({
      ciclo: CICLO,
      colaboradores: [COLAB_A], // Ana é da RT-A
      linhas: [linha({ colaboradorId: 'c1', dia: 3, codigo: 'F', presenca: false, ocupaHorario: false })],
      diasComExtraConfirmada: new Map([[chaveExtra('c1', 3), { turno: 'NOTURNO', rt: 'RT-B' }]]), // extra é um plantão da RT-B
      codigos: [],
      cobertura: [],
    });

    const ana = grade.colaboradores[0]!;
    expect(ana.dias[3]!.extraTurno).toBe('NOTURNO');
    expect(ana.dias[3]!.extraRt).toBe('RT-B');
  });

  it('5 (aproximação, sem I/O) — 80 colaboradores × 31 dias monta em memória em bem menos de 500ms', () => {
    const colaboradores: ColaboradorGradeEntrada[] = Array.from({ length: 80 }, (_, i) => ({
      id: `c${i}`,
      nome: `Colaborador ${i}`,
      matricula: String(i).padStart(4, '0'),
      rt: i % 2 === 0 ? 'RT-A' : 'RT-B',
      turnoPadrao: i % 2 === 0 ? 'DIURNO' : 'NOTURNO',
      escalaAncora: new Date(Date.UTC(2026, 8, 1 + (i % 2))),
      escalaPeriodo: 2,
    }));
    const linhas: LinhaEscalaGradeEntrada[] = [];
    for (const c of colaboradores) {
      for (let dia = 1; dia <= 31; dia++) {
        linhas.push(linha({ colaboradorId: c.id, dia, codigo: dia % 2 === 0 ? 'D' : 'F', presenca: dia % 2 === 0 }));
      }
    }

    const inicio = Date.now();
    const grade = montarGrade({
      ciclo: { ano: 2026, mes: 9, dias: 31 },
      colaboradores,
      linhas,
      diasComExtraConfirmada: new Map(),
      codigos: [],
      cobertura: [],
    });
    const duracaoMs = Date.now() - inicio;

    expect(grade.colaboradores).toHaveLength(80);
    expect(duracaoMs).toBeLessThan(500);
  });

  it('paridade vem da âncora (`trabalhaEm`), não do código do dia 1/2 — Ana (ímpar) e Bruno (par)', () => {
    const grade = montarGrade({
      ciclo: CICLO,
      colaboradores: [COLAB_A, COLAB_B],
      linhas: [
        linha({ colaboradorId: 'c1', dia: 1, codigo: 'D', presenca: true }),
        linha({ colaboradorId: 'c2', dia: 2, codigo: 'D', presenca: true }),
      ],
      diasComExtraConfirmada: new Map(),
      codigos: [],
      cobertura: [],
    });

    expect(grade.colaboradores.find((c) => c.id === 'c1')!.paridade).toBe('IMPAR');
    expect(grade.colaboradores.find((c) => c.id === 'c2')!.paridade).toBe('PAR');
  });

  it('achado em uso real: férias cobrindo os dias 1 E 2 do ciclo não muda a paridade de um colaborador PAR (Bruno continua PAR, não cai pra IMPAR)', () => {
    // Bruno trabalha no dia 2 (par). Uma ausência em lote (ex.: férias) que
    // cubra dias 1 E 2 zera `presenca` nos dois — a heurística antiga (olhar
    // o código do dia 1/2) não tinha mais nenhum `presenca = true` pra
    // decidir e caía no fallback `IMPAR`, jogando Bruno na seção errada da
    // grade (relatado pelo usuário testando em uso real).
    const grade = montarGrade({
      ciclo: CICLO,
      colaboradores: [COLAB_B],
      linhas: [
        linha({ colaboradorId: 'c2', dia: 1, codigo: 'FE', presenca: false, ocupaHorario: true }),
        linha({ colaboradorId: 'c2', dia: 2, codigo: 'FE', presenca: false, ocupaHorario: true }),
      ],
      diasComExtraConfirmada: new Map(),
      codigos: [],
      cobertura: [],
    });

    expect(grade.colaboradores[0]!.paridade).toBe('PAR');
  });

  it('coberturaPorDia é indexada por dia', () => {
    const grade = montarGrade({
      ciclo: CICLO,
      colaboradores: [],
      linhas: [],
      diasComExtraConfirmada: new Map(),
      codigos: [],
      cobertura: [{ dia: 4, rt: 'RT-A', turno: 'DIURNO', total: 3, minimo: 5 }],
    });

    expect(grade.coberturaPorDia[4]).toEqual({ rt: 'RT-A', turno: 'DIURNO', total: 3, minimo: 5 });
    expect(grade.coberturaPorDia[5]).toBeUndefined();
  });
});

describe('removerObservacoes — API-ADM-ESC-004, "C" (observacao não entra no arquivo exportado)', () => {
  it('remove `observacao` de toda célula, preservando o resto da grade', () => {
    const grade = montarGrade({
      ciclo: CICLO,
      colaboradores: [COLAB_A],
      linhas: [linha({ colaboradorId: 'c1', dia: 5, codigo: 'F', presenca: false, ocupaHorario: false, observacao: 'Atestado médico' })],
      diasComExtraConfirmada: new Map(),
      codigos: [],
      cobertura: [],
    });

    const semObs = removerObservacoes(grade);
    expect(semObs.colaboradores[0]!.dias[5]).not.toHaveProperty('observacao');
    expect(semObs.colaboradores[0]!.dias[5]!.codigo).toBe('F');
    // não muta o objeto original.
    expect(grade.colaboradores[0]!.dias[5]!.observacao).toBe('Atestado médico');
  });
});
