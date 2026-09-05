/**
 * Testes de aceitação de `API-ADM-ESC-003` — `POST /api/admin/escala/lote`
 * (tabela "Testes de aceitação", #1-6 — Prisma mockado, sem banco real).
 *
 * Mesma técnica de `../[id]/route.test.ts`: `defineHandler` é um
 * identity-mock (`(config) => config`), então `POST` importado é o próprio
 * objeto de config — `POST.handler(...)` chama a lógica de negócio
 * diretamente com um `tx` fake, e `POST.body` é o schema Zod em si (usado
 * abaixo para os testes #4/#5, que são validação de payload, não lógica do
 * `handler`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AtorAdmin, ContextoRequisicao } from '@/server/http/handler';
import { ErroHttp } from '@/server/http/erros';

vi.mock('@/server/http/handler', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defineHandler: (config: any) => config,
}));

const registrarAuditoriaMock = vi.fn().mockResolvedValue({ id: 'audit-1', hash: 'hash-1' });
vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: (...args: unknown[]) => registrarAuditoriaMock(...args),
}));

vi.mock('@/server/db/client', () => ({
  obterPrisma: async () => prismaFakeAtual,
}));

const broadcastMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/server/services/escala-admin/broadcast', () => ({
  broadcastEscalaAtualizada: (...args: unknown[]) => broadcastMock(...args),
}));

const ADMIN: AtorAdmin = { tipo: 'ADMIN', adminId: 'admin-1', email: null };
const CTX: ContextoRequisicao = {
  requestId: 'req-1',
  ip: '10.0.0.1',
  userAgent: 'vitest',
  agora: new Date('2026-09-10T10:00:00-03:00'),
  idempotencyKey: null,
};

const COLABORADOR_ID = 'colab-1';
const CICLO_ID = 'ciclo-1';

interface LinhaCoberturaCiclo {
  data: Date;
  rt_codigo: string;
  turno: 'DIURNO' | 'NOTURNO';
  total: number;
  minimo: number;
}

interface CodigoFixture {
  id: string;
  codigo: string;
  presenca: boolean;
  ocupaHorario: boolean;
  ativo: boolean;
}

const CODIGO_D: CodigoFixture = { id: 'cod-d', codigo: 'D', presenca: true, ocupaHorario: true, ativo: true };
const CODIGO_F: CodigoFixture = { id: 'cod-f', codigo: 'F', presenca: false, ocupaHorario: false, ativo: true };
const CODIGO_FT: CodigoFixture = { id: 'cod-ft', codigo: 'FT', presenca: true, ocupaHorario: true, ativo: true };

interface LinhaEscalaFixture {
  id: string;
  data: Date;
  cicloId: string;
  codigoAtual: CodigoFixture;
}

function data(dia: number): Date {
  return new Date(Date.UTC(2026, 8, dia)); // setembro/2026
}

interface FixtureTx {
  codigosDisponiveis: CodigoFixture[];
  linhasEscala: LinhaEscalaFixture[];
  extrasNoIntervalo: Array<{ id: string; plantaoId: string; data: Date }>;
  coberturaLinhas: LinhaCoberturaCiclo[];
  maxBlocosSeguidos: number;
  falharNaJornadaNoDia?: number;
}

function fixturePadrao(overrides: Partial<FixtureTx> = {}): FixtureTx {
  return {
    codigosDisponiveis: [CODIGO_D, CODIGO_F],
    linhasEscala: Array.from({ length: 15 }, (_, i) => ({ id: `ed-${i + 1}`, data: data(i + 1), cicloId: CICLO_ID, codigoAtual: CODIGO_D })),
    extrasNoIntervalo: [],
    coberturaLinhas: [],
    maxBlocosSeguidos: 2,
    ...overrides,
  };
}

let prismaFakeAtual: PrismaClient;

function criarPrismaFake(fixture: FixtureTx): PrismaClient {
  const tx = {
    colaborador: {
      findUnique: vi.fn(async () => ({
        id: COLABORADOR_ID,
        escalaAncora: data(1),
        escalaPeriodo: 2,
        turnoPadrao: 'DIURNO',
        rt: { nome: 'RT-A' },
        trocasEscala: [],
      })),
    },
    codigoEscala: {
      findFirst: vi.fn(async ({ where }: { where: { codigo: string } }) => fixture.codigosDisponiveis.find((c) => c.codigo === where.codigo && c.ativo) ?? null),
    },
    escalaDia: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.ciclo) {
          // Consulta principal (passo 2 do fluxo): dias do intervalo com escala, ciclo não FECHADO.
          return fixture.linhasEscala.map((l) => ({
            id: l.id,
            data: l.data,
            cicloId: l.cicloId,
            codigoEscala: l.codigoAtual,
            ciclo: { maxBlocosSeguidos: fixture.maxBlocosSeguidos },
          }));
        }
        // Janela de jornada (fonteBlocosOcupadosPrisma) — sem vizinhos extras neste fixture.
        return [];
      }),
      updateMany: vi.fn(async () => ({ count: fixture.linhasEscala.length })),
    },
    marcacao: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.plantao) {
          return fixture.extrasNoIntervalo.map((e) => ({ id: e.id, plantaoId: e.plantaoId, plantao: { data: e.data } }));
        }
        return [];
      }),
    },
    $queryRaw: vi.fn(async () => fixture.coberturaLinhas),
    $executeRaw: vi.fn(async () => 0),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as PrismaClient;
}

async function chamar(fixture: FixtureTx, body: { colaboradorId?: string; de: string; ate: string; codigo: string; observacao?: string; confirmarImpacto?: boolean }) {
  prismaFakeAtual = criarPrismaFake(fixture);
  const { POST } = await import('./route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (POST as any).handler({ ator: ADMIN, body: { colaboradorId: COLABORADOR_ID, ...body }, ctx: CTX });
}

describe('POST /api/admin/escala/lote — API-ADM-ESC-003', () => {
  beforeEach(() => {
    registrarAuditoriaMock.mockClear();
    broadcastMock.mockClear();
  });

  it('1. intervalo de 15 dias: só dias com escala alterados', async () => {
    const resultado = await chamar(fixturePadrao(), { de: '2026-09-01', ate: '2026-09-15', codigo: 'F' });

    expect(resultado.alterados).toBe(15);
    expect(resultado.ignorados).toBe(0);
  });

  it('1b. intervalo com dias fora da escala (sem linha `escala_dia`): ignorados > 0', async () => {
    const fixture = fixturePadrao({ linhasEscala: [{ id: 'ed-1', data: data(1), cicloId: CICLO_ID, codigoAtual: CODIGO_D }] });

    const resultado = await chamar(fixture, { de: '2026-09-01', ate: '2026-09-05', codigo: 'F' });

    expect(resultado.alterados).toBe(1);
    expect(resultado.ignorados).toBe(4);
  });

  it('2. falha no meio (revalidação de jornada lança): a chamada propaga o erro e nenhuma auditoria é registrada (rollback é responsabilidade da transação real)', async () => {
    // `F` → `FT` ocupa horário — dispara revalidação de jornada (uma consulta
    // pra janela do lote inteiro, ver teste 8).
    // Fixture dedicado: `escalaDia.updateMany` funciona (a alteração em massa
    // "aconteceria"), mas a consulta de marcações da janela de jornada lança
    // — a função de negócio propaga sem engolir, então a `emTransacao` real
    // do caller faria rollback de tudo, inclusive o `updateMany` já aplicado.
    const txFake = {
      colaborador: { findUnique: vi.fn(async () => ({ id: COLABORADOR_ID, escalaAncora: data(1), escalaPeriodo: 2, turnoPadrao: 'DIURNO', rt: { nome: 'RT-A' }, trocasEscala: [] })) },
      codigoEscala: { findFirst: vi.fn(async () => CODIGO_FT) },
      escalaDia: {
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          if (where.ciclo) {
            return [{ id: 'ed-1', data: data(1), cicloId: CICLO_ID, codigoEscala: CODIGO_F, ciclo: { maxBlocosSeguidos: 2 } }];
          }
          return [];
        }),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      marcacao: {
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          if (where.plantao) return [];
          throw new Error('falha simulada na consulta de jornada');
        }),
      },
      $queryRaw: vi.fn(async () => []),
      $executeRaw: vi.fn(async () => 0),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    prismaFakeAtual = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txFake)) } as unknown as PrismaClient;

    const { POST } = await import('./route');
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (POST as any).handler({ ator: ADMIN, body: { colaboradorId: COLABORADOR_ID, de: '2026-09-01', ate: '2026-09-01', codigo: 'FT' }, ctx: CTX }),
    ).rejects.toThrow('falha simulada na consulta de jornada');

    expect(registrarAuditoriaMock).not.toHaveBeenCalled();
  });

  it('8. revalidação de jornada busca a janela do lote em UMA consulta, não uma por dia (achado em uso real: 15 dias sequenciais estourava timeout contra o banco remoto)', async () => {
    const chamadasEscalaDiaJanela: Array<Record<string, unknown>> = [];
    const chamadasMarcacaoJanela: Array<Record<string, unknown>> = [];
    const DIAS = [1, 2, 3];
    const txFake = {
      colaborador: { findUnique: vi.fn(async () => ({ id: COLABORADOR_ID, escalaAncora: data(1), escalaPeriodo: 2, turnoPadrao: 'DIURNO', rt: { nome: 'RT-A' }, trocasEscala: [] })) },
      codigoEscala: { findFirst: vi.fn(async () => CODIGO_FT) },
      escalaDia: {
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          if (where.ciclo) {
            // Passo 2 do fluxo: dias do intervalo do lote (maxBlocosSeguidos alto pra não disparar EXCEDE_JORNADA neste teste).
            return DIAS.map((dia) => ({ id: `ed-${dia}`, data: data(dia), cicloId: CICLO_ID, codigoEscala: CODIGO_D, ciclo: { maxBlocosSeguidos: 10 } }));
          }
          // Batching da janela de jornada — deve ser chamado UMA vez para o lote inteiro, não uma vez por dia.
          chamadasEscalaDiaJanela.push(where);
          return DIAS.map((dia) => ({ id: `ed-${dia}`, data: data(dia), codigoEscala: CODIGO_FT }));
        }),
        updateMany: vi.fn(async () => ({ count: DIAS.length })),
      },
      marcacao: {
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          if (where.plantao) return [];
          chamadasMarcacaoJanela.push(where);
          return [];
        }),
      },
      $queryRaw: vi.fn(async () => []),
      $executeRaw: vi.fn(async () => 0),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    prismaFakeAtual = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txFake)) } as unknown as PrismaClient;

    const { POST } = await import('./route');
    const resultado = await (POST as any).handler({ // eslint-disable-line @typescript-eslint/no-explicit-any
      ator: ADMIN,
      body: { colaboradorId: COLABORADOR_ID, de: '2026-09-01', ate: '2026-09-03', codigo: 'FT' },
      ctx: CTX,
    });

    expect(resultado.alterados).toBe(3);
    // Uma consulta cobrindo a janela do lote inteiro — não uma por dia (seriam 3 chamadas com o fixture antigo).
    expect(chamadasEscalaDiaJanela).toHaveLength(1);
    expect(chamadasMarcacaoJanela).toHaveLength(1);
  });

  it('3. extras no intervalo: listadas no impacto', async () => {
    const fixture = fixturePadrao({ extrasNoIntervalo: [{ id: 'marc-1', plantaoId: 'plantao-1', data: data(3) }] });

    const erro = await chamar(fixture, { de: '2026-09-01', ate: '2026-09-15', codigo: 'F' }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect((erro as ErroHttp).codigo).toBe('IMPACTO_NAO_CONFIRMADO');

    const resultado = await chamar(fixture, { de: '2026-09-01', ate: '2026-09-15', codigo: 'F', confirmarImpacto: true });
    expect(resultado.impacto.extrasAfetadas).toEqual([{ marcacaoId: 'marc-1', plantaoId: 'plantao-1', data: '2026-09-03' }]);
  });

  it('4. intervalo de 200 dias: 422 (validação de payload, teto de 92 dias)', async () => {
    const { POST } = await import('./route');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = (POST as any).body;

    const resultado = schema.safeParse({ colaboradorId: COLABORADOR_ID, de: '2026-01-01', ate: '2026-07-20', codigo: 'F' });

    expect(resultado.success).toBe(false);
  });

  it('5. `de > ate`: 422 (validação de payload)', async () => {
    const { POST } = await import('./route');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = (POST as any).body;

    const resultado = schema.safeParse({ colaboradorId: COLABORADOR_ID, de: '2026-09-15', ate: '2026-09-01', codigo: 'F' });

    expect(resultado.success).toBe(false);
  });

  it('6. auditoria: uma entrada com o intervalo, não uma por dia', async () => {
    await chamar(fixturePadrao(), { de: '2026-09-01', ate: '2026-09-15', codigo: 'F' });

    expect(registrarAuditoriaMock).toHaveBeenCalledTimes(1);
    const evento = registrarAuditoriaMock.mock.calls[0]![1] as { acao: string; payload: unknown };
    expect(evento.acao).toBe('AUSENCIA_ALTERADA');
    expect(evento.payload).toMatchObject({ de: '2026-09-01', ate: '2026-09-15', codigo: 'F', alterados: 15 });
  });

  it('7. broadcast `escala:atualizada` (RT-001/05-realtime/canais.md): um evento por dia alterado, só depois do commit', async () => {
    await chamar(fixturePadrao(), { de: '2026-09-01', ate: '2026-09-15', codigo: 'F' });

    expect(broadcastMock).toHaveBeenCalledTimes(15);
    expect(broadcastMock).toHaveBeenCalledWith(CICLO_ID, { colaboradorId: COLABORADOR_ID, data: '2026-09-01' });
    expect(broadcastMock).toHaveBeenCalledWith(CICLO_ID, { colaboradorId: COLABORADOR_ID, data: '2026-09-15' });
  });
});
