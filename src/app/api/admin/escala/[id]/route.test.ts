/**
 * Testes de aceitação de `API-ADM-ESC-002` — `PATCH /api/admin/escala/:id`
 * (tabela "Testes de aceitação", #1-8 — Prisma mockado, sem banco real).
 *
 * `defineHandler` é substituído por um identity-mock (`(config) => config`):
 * a autorização/validação Zod/serialização já são cobertas genericamente por
 * `API-000`/`handler.test.ts`, e esta spec não lista um teste de ator (só
 * `ADMIN` chama esta rota) — o que resta a testar aqui é o `handler` de
 * negócio em si, chamado diretamente com um `tx` fake. `emTransacao`
 * (`@/server/db/tx`) roda de verdade contra um `prisma.$transaction` fake
 * que invoca o callback com o `tx` fake — mesmo padrão de
 * `src/server/ciclos/gerar-escala.test.ts`.
 *
 * #7 ("concorrente com marcação de extra: serializado, sem violação")
 * depende de duas conexões reais disputando o mesmo advisory lock — não
 * reproduzível com mock em processo único (mesma ressalva já registrada em
 * `gerar-escala.test.ts` para F3-5). Verificado aqui só o que É testável sem
 * banco real: a ordem de chamadas (lock adquirido *antes* de ler o impacto).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AtorAdmin, ContextoRequisicao } from '@/server/http/handler';
import { ErroHttp } from '@/server/http/erros';
import { blocoDoTurno } from '@/lib/escala/blocos';

vi.mock('@/server/http/handler', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defineHandler: (config: any) => config,
}));

const registrarAuditoriaMock = vi.fn().mockResolvedValue({ id: 'audit-1', hash: 'hash-1' });
vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: (...args: unknown[]) => registrarAuditoriaMock(...args),
}));

const broadcastMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/server/services/escala-admin/broadcast', () => ({
  broadcastEscalaAtualizada: (...args: unknown[]) => broadcastMock(...args),
}));

vi.mock('@/server/db/client', () => ({
  obterPrisma: async () => prismaFakeAtual,
}));

const ADMIN: AtorAdmin = { tipo: 'ADMIN', adminId: 'admin-1', email: null };
const CTX: ContextoRequisicao = {
  requestId: 'req-1',
  ip: '10.0.0.1',
  userAgent: 'vitest',
  agora: new Date('2026-09-10T10:00:00-03:00'),
  idempotencyKey: null,
};

const DATA_DIA = new Date(Date.UTC(2026, 8, 10)); // 2026-09-10
const COLABORADOR_ID = 'colab-1';
const CICLO_ID = 'ciclo-1';
const ESCALA_DIA_ID = 'ed-1';

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

interface FixtureTx {
  cicloStatus: 'ABERTO' | 'FECHADO';
  codigoAtual: CodigoFixture;
  codigosDisponiveis: CodigoFixture[];
  extrasNoDia: Array<{ id: string; plantaoId: string }>;
  coberturaLinhas: LinhaCoberturaCiclo[];
  maxBlocosSeguidos: number;
  blocosVizinhosEscala: Array<{ id: string; data: Date; presenca: boolean; ocupaHorario: boolean }>;
  marcacoesJanela: Array<{ inicioEm: Date; fimEm: Date }>;
  observacao?: string | null;
}

let ordemChamadas: string[] = [];

function fixturePadrao(overrides: Partial<FixtureTx> = {}): FixtureTx {
  return {
    cicloStatus: 'ABERTO',
    codigoAtual: CODIGO_D,
    codigosDisponiveis: [CODIGO_D, CODIGO_F, CODIGO_FT],
    extrasNoDia: [],
    coberturaLinhas: [{ data: DATA_DIA, rt_codigo: 'RT-A', turno: 'DIURNO', total: 5, minimo: 5 }],
    maxBlocosSeguidos: 2,
    blocosVizinhosEscala: [],
    marcacoesJanela: [],
    observacao: null,
    ...overrides,
  };
}

let prismaFakeAtual: PrismaClient;

function criarPrismaFake(fixture: FixtureTx): PrismaClient {
  const tx = {
    escalaDia: {
      findUnique: vi.fn(async () => ({
        id: ESCALA_DIA_ID,
        cicloId: CICLO_ID,
        colaboradorId: COLABORADOR_ID,
        data: DATA_DIA,
        observacao: fixture.observacao ?? null,
        codigoEscala: fixture.codigoAtual,
        ciclo: { status: fixture.cicloStatus, maxBlocosSeguidos: fixture.maxBlocosSeguidos },
        colaborador: {
          id: COLABORADOR_ID,
          escalaAncora: DATA_DIA,
          escalaPeriodo: 2,
          turnoPadrao: 'DIURNO',
          rt: { nome: 'RT-A' },
          trocasEscala: [],
        },
      })),
      update: vi.fn(async ({ data }: { data: { codigoEscalaId: string; observacao?: string } }) => {
        const codigoNovo = fixture.codigosDisponiveis.find((c) => c.id === data.codigoEscalaId)!;
        return {
          id: ESCALA_DIA_ID,
          data: DATA_DIA,
          observacao: data.observacao ?? null,
          codigoEscala: codigoNovo,
        };
      }),
      findMany: vi.fn(async () => fixture.blocosVizinhosEscala.map((l) => ({ id: l.id, data: l.data, codigoEscala: { presenca: l.presenca, ocupaHorario: l.ocupaHorario } }))),
    },
    codigoEscala: {
      findFirst: vi.fn(async ({ where }: { where: { codigo: string } }) => fixture.codigosDisponiveis.find((c) => c.codigo === where.codigo && c.ativo) ?? null),
    },
    marcacao: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.plantao) {
          ordemChamadas.push('marcacao.findMany:extrasDoDia');
          return fixture.extrasNoDia;
        }
        ordemChamadas.push('marcacao.findMany:janela');
        return fixture.marcacoesJanela;
      }),
    },
    $queryRaw: vi.fn(async () => fixture.coberturaLinhas),
    $executeRaw: vi.fn(async () => {
      ordemChamadas.push('travarColaborador');
      return 0;
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as PrismaClient;
}

async function chamar(fixture: FixtureTx, body: { codigo: string; observacao?: string; confirmarImpacto?: boolean }) {
  prismaFakeAtual = criarPrismaFake(fixture);
  const { PATCH } = await import('./route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PATCH as any).handler({ ator: ADMIN, params: Promise.resolve({ id: ESCALA_DIA_ID }), body, ctx: CTX });
}

describe('PATCH /api/admin/escala/:id — API-ADM-ESC-002', () => {
  beforeEach(() => {
    ordemChamadas = [];
    registrarAuditoriaMock.mockClear();
    broadcastMock.mockClear();
  });

  it('1. D → F sem extras: aplicado', async () => {
    const resultado = await chamar(fixturePadrao(), { codigo: 'F' });

    expect(resultado.escalaDia.codigo).toBe('F');
    expect(resultado.impacto.extrasAfetadas).toEqual([]);
    expect(broadcastMock).toHaveBeenCalledTimes(1);
  });

  it('2. D → F com extra no dia, sem confirmarImpacto: IMPACTO_NAO_CONFIRMADO', async () => {
    const fixture = fixturePadrao({ extrasNoDia: [{ id: 'marc-1', plantaoId: 'plantao-1' }] });

    const erro = await chamar(fixture, { codigo: 'F' }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroHttp);
    expect((erro as ErroHttp).status).toBe(409);
    expect((erro as ErroHttp).codigo).toBe('IMPACTO_NAO_CONFIRMADO');
  });

  it('3. confirmado: aplicado, extra mantida, impacto auditado', async () => {
    const fixture = fixturePadrao({ extrasNoDia: [{ id: 'marc-1', plantaoId: 'plantao-1' }] });

    const resultado = await chamar(fixture, { codigo: 'F', confirmarImpacto: true });

    expect(resultado.escalaDia.codigo).toBe('F');
    expect(resultado.impacto.extrasAfetadas).toEqual([{ marcacaoId: 'marc-1', plantaoId: 'plantao-1' }]);
    expect(registrarAuditoriaMock).toHaveBeenCalledTimes(1);
    const evento = registrarAuditoriaMock.mock.calls[0]![1] as { acao: string; payload: unknown };
    expect(evento.acao).toBe('AUSENCIA_ALTERADA');
    expect(evento.payload).toMatchObject({ anterior: 'D', novo: 'F', extrasAfetadas: ['marc-1'] });
  });

  it('4. F → FT criando 36h (3 blocos de 12h contíguos, teto = 2): EXCEDE_JORNADA', async () => {
    const novoBloco = blocoDoTurno(DATA_DIA, 'DIURNO');
    const blocoAntes = { inicioEm: new Date(+novoBloco.inicio - 12 * 60 * 60 * 1000), fimEm: novoBloco.inicio };
    const blocoDepois = { inicioEm: novoBloco.fim, fimEm: new Date(+novoBloco.fim + 12 * 60 * 60 * 1000) };
    const fixture = fixturePadrao({
      codigoAtual: CODIGO_F,
      marcacoesJanela: [blocoAntes, blocoDepois],
    });

    const erro = await chamar(fixture, { codigo: 'FT' }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroHttp);
    expect((erro as ErroHttp).status).toBe(409);
    expect((erro as ErroHttp).codigo).toBe('EXCEDE_JORNADA');
  });

  it('5. código inexistente: 422 CODIGO_INVALIDO', async () => {
    const erro = await chamar(fixturePadrao(), { codigo: 'ZZZ' }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroHttp);
    expect((erro as ErroHttp).status).toBe(422);
    expect((erro as ErroHttp).codigo).toBe('CODIGO_INVALIDO');
  });

  it('6. ciclo fechado: 409 CICLO_FECHADO', async () => {
    const fixture = fixturePadrao({ cicloStatus: 'FECHADO' });

    const erro = await chamar(fixture, { codigo: 'F' }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroHttp);
    expect((erro as ErroHttp).status).toBe(409);
    expect((erro as ErroHttp).codigo).toBe('CICLO_FECHADO');
  });

  it('7. lock do colaborador é adquirido antes de ler o impacto (ordem de acesso, base para serialização real)', async () => {
    await chamar(fixturePadrao(), { codigo: 'F' });

    const indiceLock = ordemChamadas.indexOf('travarColaborador');
    const indiceLeituraImpacto = ordemChamadas.indexOf('marcacao.findMany:extrasDoDia');
    expect(indiceLock).toBeGreaterThanOrEqual(0);
    expect(indiceLeituraImpacto).toBeGreaterThan(indiceLock);
  });

  it('8. cobertura cruzando o mínimo: aviso no impacto (deficit > 0 em coberturaDepois)', async () => {
    const fixture = fixturePadrao({ coberturaLinhas: [{ data: DATA_DIA, rt_codigo: 'RT-A', turno: 'DIURNO', total: 5, minimo: 5 }] });

    const resultado = await chamar(fixture, { codigo: 'F' });

    expect(resultado.impacto.coberturaAntes.deficit).toBe(0);
    expect(resultado.impacto.coberturaDepois.total).toBe(4);
    expect(resultado.impacto.coberturaDepois.deficit).toBe(1);
  });
});
