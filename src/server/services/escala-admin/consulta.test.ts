/**
 * Testes de `buscarGrade` (`API-ADM-ESC-001`, reaproveitado por
 * `API-ADM-ESC-004`) com um `tx` fake (mock de Prisma) — cobre a parte da
 * tabela "Testes de aceitação" que depende de consulta/filtro: #1 (ciclo com
 * escala), #2 (filtro por RT — só a RT pedida). #3/#4 (célula ausente,
 * `observacao`) e #5 (perf) já são cobertos em `grade.test.ts` (montagem em
 * memória, sem I/O). #6 (colaborador chamando → 403) é autorização de rota,
 * coberta em `route.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ClienteTransacao } from '@/server/db/tx';
import { buscarGrade } from './consulta';

interface ColaboradorFixture {
  id: string;
  nome: string;
  matricula: string;
  turnoPadrao: 'DIURNO' | 'NOTURNO';
  rtId: string;
  rtNome: string;
  escalaAncora?: Date;
  escalaPeriodo?: number;
}

interface EscalaDiaFixture {
  id: string;
  colaboradorId: string;
  cicloId: string;
  data: Date;
  codigo: string;
  presenca: boolean;
  ocupaHorario: boolean;
  observacao: string | null;
}

interface MarcacaoFixture {
  colaboradorId: string;
  data: Date;
  tipo: 'DIURNO' | 'NOTURNO';
  rtNome: string;
}

function criarTxFake(params: {
  ciclo: { id: string; ano: number; mes: number } | null;
  colaboradores: ColaboradorFixture[];
  escalaDia: EscalaDiaFixture[];
  marcacoes?: MarcacaoFixture[];
  cobertura?: Array<{ data: Date; rt_codigo: string; turno: 'DIURNO' | 'NOTURNO'; total: number; minimo: number }>;
}): ClienteTransacao {
  const tx = {
    ciclo: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        params.ciclo && params.ciclo.id === where.id ? params.ciclo : null,
      ),
    },
    colaborador: {
      findMany: vi.fn(async ({ where }: { where: { rtId?: string; turnoPadrao?: string } }) =>
        params.colaboradores
          .filter((c) => (where.rtId ? c.rtId === where.rtId : true))
          .filter((c) => (where.turnoPadrao ? c.turnoPadrao === where.turnoPadrao : true))
          .map((c) => ({
            id: c.id,
            nome: c.nome,
            matricula: c.matricula,
            turnoPadrao: c.turnoPadrao,
            escalaAncora: c.escalaAncora ?? new Date(Date.UTC(2026, 8, 1)),
            escalaPeriodo: c.escalaPeriodo ?? 2,
            rt: { id: c.rtId, nome: c.rtNome },
          })),
      ),
    },
    escalaDia: {
      findMany: vi.fn(async ({ where }: { where: { cicloId: string; colaboradorId: { in: string[] } } }) =>
        params.escalaDia
          .filter((l) => l.cicloId === where.cicloId && where.colaboradorId.in.includes(l.colaboradorId))
          .map((l) => ({
            id: l.id,
            colaboradorId: l.colaboradorId,
            data: l.data,
            observacao: l.observacao,
            codigoEscala: { codigo: l.codigo, presenca: l.presenca, ocupaHorario: l.ocupaHorario },
          })),
      ),
    },
    marcacao: {
      findMany: vi.fn(async () =>
        (params.marcacoes ?? []).map((m) => ({
          colaboradorId: m.colaboradorId,
          plantao: { data: m.data, tipo: m.tipo, rt: { nome: m.rtNome } },
        })),
      ),
    },
    codigoEscala: {
      findMany: vi.fn(async () => [
        { codigo: 'D', descricao: 'Dia trabalhado', cor: '#000', presenca: true, ocupaHorario: true },
        { codigo: 'F', descricao: 'Folga', cor: '#111', presenca: false, ocupaHorario: false },
      ]),
    },
    $queryRaw: vi.fn(async () => params.cobertura ?? []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake mínimo, só os métodos usados por `buscarGrade`.
  } as any;
  return tx as ClienteTransacao;
}

const CICLO_ID = 'ciclo-1';
const RT_A = 'rt-a';
const RT_B = 'rt-b';

describe('buscarGrade — API-ADM-ESC-001', () => {
  it('1. ciclo com escala: grade completa, todos os colaboradores ativos', async () => {
    const tx = criarTxFake({
      ciclo: { id: CICLO_ID, ano: 2026, mes: 9 },
      colaboradores: [
        { id: 'c1', nome: 'Ana', matricula: '0001', turnoPadrao: 'DIURNO', rtId: RT_A, rtNome: 'RT A' },
        { id: 'c2', nome: 'Bruno', matricula: '0002', turnoPadrao: 'NOTURNO', rtId: RT_B, rtNome: 'RT B' },
      ],
      escalaDia: [
        { id: 'ed1', colaboradorId: 'c1', cicloId: CICLO_ID, data: new Date(Date.UTC(2026, 8, 1)), codigo: 'D', presenca: true, ocupaHorario: true, observacao: null },
      ],
    });

    const grade = await buscarGrade(tx, CICLO_ID, {});

    expect(grade).not.toBeNull();
    expect(grade!.ciclo).toEqual({ ano: 2026, mes: 9, dias: 30 });
    expect(grade!.colaboradores.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(grade!.codigos.map((c) => c.codigo)).toEqual(['D', 'F']);
  });

  it('2. filtro por RT: só a RT pedida aparece na grade', async () => {
    const tx = criarTxFake({
      ciclo: { id: CICLO_ID, ano: 2026, mes: 9 },
      colaboradores: [
        { id: 'c1', nome: 'Ana', matricula: '0001', turnoPadrao: 'DIURNO', rtId: RT_A, rtNome: 'RT A' },
        { id: 'c2', nome: 'Bruno', matricula: '0002', turnoPadrao: 'NOTURNO', rtId: RT_B, rtNome: 'RT B' },
      ],
      escalaDia: [],
    });

    const grade = await buscarGrade(tx, CICLO_ID, { rt: RT_A });

    expect(grade!.colaboradores.map((c) => c.id)).toEqual(['c1']);
  });

  it('extra cruzada de RT: `extraRt` vem da RT do plantão coberto, não da RT do colaborador (achado em uso real — extras não relacionavam à RT certa)', async () => {
    const tx = criarTxFake({
      ciclo: { id: CICLO_ID, ano: 2026, mes: 9 },
      colaboradores: [{ id: 'c1', nome: 'Ana', matricula: '0001', turnoPadrao: 'DIURNO', rtId: RT_A, rtNome: 'RT A' }],
      escalaDia: [
        { id: 'ed1', colaboradorId: 'c1', cicloId: CICLO_ID, data: new Date(Date.UTC(2026, 8, 5)), codigo: 'F', presenca: false, ocupaHorario: false, observacao: null },
      ],
      // Ana é da RT A, mas a extra que ela cobriu é um plantão da RT B.
      marcacoes: [{ colaboradorId: 'c1', data: new Date(Date.UTC(2026, 8, 5)), tipo: 'NOTURNO', rtNome: 'RT B' }],
    });

    const grade = await buscarGrade(tx, CICLO_ID, {});

    const ana = grade!.colaboradores.find((c) => c.id === 'c1')!;
    expect(ana.dias[5]!.temExtra).toBe(true);
    expect(ana.dias[5]!.extraTurno).toBe('NOTURNO');
    expect(ana.dias[5]!.extraRt).toBe('RT B');
  });

  it('ciclo inexistente: `null` (rota traduz para 404)', async () => {
    const tx = criarTxFake({ ciclo: null, colaboradores: [], escalaDia: [] });

    const grade = await buscarGrade(tx, 'ciclo-x', {});

    expect(grade).toBeNull();
  });
});
