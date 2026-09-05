/**
 * Testes de aceitação de `specs/04-api/admin-colaboradores/API-ADM-COL-009-exportar-dados.md`.
 *
 * Mesma técnica de injeção de `resetar-pin/route.test.ts` (ver doc-comment
 * lá). `criarHandlerExportarDados` (o handler interno, JSON-only) é testado
 * diretamente — o wrapper `GET` exportado (que troca o corpo por binário
 * quando `formato=pdf`) só reempacota a resposta, sem lógica de negócio
 * própria (mesmo padrão documentado em `route.ts`).
 */
import { beforeAll, describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import type { AtorAdmin, DependenciasHandler, criarDefineHandler as CriarDefineHandlerFn } from '@/server/http/handler';

const AGORA_FIXA = new Date('2026-09-04T12:00:00.000Z');
const ADMIN: AtorAdmin = { tipo: 'ADMIN', adminId: 'admin-1', email: 'admin@exemplo.com' };
const COLABORADOR_ID = '11111111-1111-1111-1111-111111111111';
const COLABORADOR_INEXISTENTE_ID = '22222222-2222-2222-2222-222222222222';
const OUTRO_COLABORADOR_ID = '33333333-3333-3333-3333-333333333333';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:6543/extras?pgbouncer=true';
  process.env.DIRECT_URL ??= 'postgresql://postgres:postgres@localhost:5432/extras';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'teste';
  process.env.SESSION_SECRET ??= 'a'.repeat(32);
  process.env.CPF_PEPPER ??= 'pepper-cpf-teste';
  process.env.PIN_PEPPER ??= 'pepper-pin-teste';
  process.env.UPSTASH_REDIS_REST_URL ??= 'https://exemplo.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ??= 'teste';
  process.env.TZ ??= 'America/Sao_Paulo';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://exemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'teste';
});

vi.mock('@/server/http/handler', async () => {
  const actual = await vi.importActual<typeof import('@/server/http/handler')>('@/server/http/handler');
  const deps: DependenciasHandler = {
    relogio: () => AGORA_FIXA,
    resolverSessao: vi.fn(async () => ADMIN),
    verificarLimite: vi.fn(async () => ({ permitido: true, limite: 100, restante: 99, retryAfter: 0 })),
    registrarLog: vi.fn(),
    gerarRequestId: () => 'req-fixo-1',
  };
  return { ...actual, defineHandler: (actual.criarDefineHandler as typeof CriarDefineHandlerFn)(deps) };
});

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn(async () => ({ id: 'audit-1', hash: 'hash-1' })),
}));

interface FakePrisma {
  colaborador: { findUnique: ReturnType<typeof vi.fn> };
  escalaDia: { findMany: ReturnType<typeof vi.fn> };
  marcacao: { findMany: ReturnType<typeof vi.fn> };
  trocaEscala: { findMany: ReturnType<typeof vi.fn> };
  tentativaLogin: { findMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
}

function criarPrismaFake(config: { existe?: boolean } = {}): FakePrisma {
  const existe = config.existe ?? true;
  const colaborador = {
    id: COLABORADOR_ID,
    matricula: '00123',
    nome: 'Fulano de Tal',
    pinHash: 'hash-de-pin-nunca-deve-sair-daqui',
    precisaTrocarPin: false,
    rtId: 'rt-1',
    rt: { id: 'rt-1', nome: 'RT Norte' },
    turnoPadrao: 'DIURNO',
    escalaAncora: new Date('2026-01-05T00:00:00Z'),
    escalaPeriodo: 2,
    escalaHoraInicio: null,
    escalaHoraFim: null,
    ativo: true,
    criadoEm: new Date('2025-06-01T10:00:00Z'),
  };

  const prisma: FakePrisma = {
    colaborador: { findUnique: vi.fn(async () => (existe ? colaborador : null)) },
    escalaDia: {
      findMany: vi.fn(async () => [
        { data: new Date('2026-09-10T00:00:00Z'), horaInicio: null, horaFim: null, codigoEscala: { codigo: 'D' } },
      ]),
    },
    marcacao: {
      findMany: vi.fn(async () => [
        {
          id: 'marc-1',
          plantaoId: 'plantao-1',
          status: 'CONFIRMADA',
          origem: 'COLABORADOR',
          cruzada: false,
          inicioEm: new Date('2026-09-10T08:00:00Z'),
          fimEm: new Date('2026-09-10T20:00:00Z'),
          motivo: null,
          criadoEm: new Date('2026-09-01T09:00:00Z'),
          canceladoEm: null,
        },
      ]),
    },
    trocaEscala: {
      findMany: vi.fn(async () => [
        {
          id: 'troca-1',
          vigenciaInicio: new Date('2026-10-01T00:00:00Z'),
          turno: 'NOTURNO',
          ancora: new Date('2026-10-01T00:00:00Z'),
          periodo: 2,
          motivo: 'Mudança de turno solicitada.',
          criadoEm: new Date('2026-09-02T14:00:00Z'),
        },
      ]),
    },
    tentativaLogin: {
      findMany: vi.fn(async () => [
        { criadoEm: new Date('2026-09-03T08:00:00Z'), sucesso: true, motivo: null, ip: '203.0.113.9' },
      ]),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  return prisma;
}

function req(url: string): NextRequest {
  const headers = new Headers({ 'x-requested-with': 'fetch' });
  return new NextRequest(new URL(url, 'http://localhost'), { method: 'GET', headers });
}

let criarHandlerExportarDados: typeof import('./_impl').criarHandlerExportarDados;
let registrarAuditoria: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const modulo = await import('./_impl');
  criarHandlerExportarDados = modulo.criarHandlerExportarDados;
  const auditoria = await import('@/server/audit/registrar');
  registrarAuditoria = vi.mocked(auditoria.registrarAuditoria);
});

beforeEach(() => {
  registrarAuditoria.mockClear();
});

describe('API-ADM-COL-009 GET /api/admin/colaboradores/:id/exportar-dados', () => {
  it('teste 1 — reúne todos os registros do titular (cadastro, escalas, marcações, trocas, acessos)', async () => {
    const prisma = criarPrismaFake();
    const GET = criarHandlerExportarDados(prisma as unknown as PrismaClient);

    const response = await GET(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_ID}/exportar-dados?formato=json`), {
      params: Promise.resolve({ id: COLABORADOR_ID }),
    });

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.pacote.cadastro.id).toBe(COLABORADOR_ID);
    expect(corpo.pacote.escalas).toHaveLength(1);
    expect(corpo.pacote.marcacoes).toHaveLength(1);
    expect(corpo.pacote.trocasEscala).toHaveLength(1);
    expect(corpo.pacote.acessos).toHaveLength(1);
    expect(corpo.pacote.geradoEm).toBe(AGORA_FIXA.toISOString());
  });

  it('teste 2 — hash de credencial (pinHash) ausente do pacote', async () => {
    const prisma = criarPrismaFake();
    const GET = criarHandlerExportarDados(prisma as unknown as PrismaClient);

    const response = await GET(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_ID}/exportar-dados?formato=json`), {
      params: Promise.resolve({ id: COLABORADOR_ID }),
    });
    const corpo = await response.json();
    const textoCompleto = JSON.stringify(corpo);

    expect(corpo.pacote.cadastro).not.toHaveProperty('pinHash');
    expect(textoCompleto).not.toContain('hash-de-pin-nunca-deve-sair-daqui');
    // "pinDefinido" é o único derivado de pinHash exposto — nunca o hash em si.
    expect(corpo.pacote.cadastro.pinDefinido).toBe(true);
  });

  it('teste 3 — dados de terceiros ausentes (consulta filtrada só pelo colaborador do path)', async () => {
    const prisma = criarPrismaFake();
    const GET = criarHandlerExportarDados(prisma as unknown as PrismaClient);

    await GET(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_ID}/exportar-dados?formato=json`), { params: Promise.resolve({ id: COLABORADOR_ID }) });

    expect(prisma.escalaDia.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { colaboradorId: COLABORADOR_ID } }));
    expect(prisma.marcacao.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { colaboradorId: COLABORADOR_ID } }));
    expect(prisma.trocaEscala.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { colaboradorId: COLABORADOR_ID } }));
    expect(prisma.tentativaLogin.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { colaboradorId: COLABORADOR_ID } }));
    // Nunca consulta por um id diferente do path (não haveria como vazar dado de outro colaborador).
    expect(prisma.escalaDia.findMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: { colaboradorId: OUTRO_COLABORADOR_ID } }));
  });

  it('teste 4 — aviso de retenção presente', async () => {
    const prisma = criarPrismaFake();
    const GET = criarHandlerExportarDados(prisma as unknown as PrismaClient);

    const response = await GET(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_ID}/exportar-dados?formato=json`), {
      params: Promise.resolve({ id: COLABORADOR_ID }),
    });
    const corpo = await response.json();

    expect(typeof corpo.pacote.observacaoRetencao).toBe('string');
    expect(corpo.pacote.observacaoRetencao.length).toBeGreaterThan(0);
    expect(corpo.pacote.observacaoRetencao).toMatch(/5 anos/);
  });

  it('teste 5 — audita EXPORTACAO_DADOS com escopo e contagens', async () => {
    const prisma = criarPrismaFake();
    const GET = criarHandlerExportarDados(prisma as unknown as PrismaClient);

    await GET(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_ID}/exportar-dados?formato=json`), { params: Promise.resolve({ id: COLABORADOR_ID }) });

    expect(registrarAuditoria).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        acao: 'EXPORTACAO_DADOS',
        atorTipo: 'ADMIN',
        atorId: 'admin-1',
        entidade: 'colaborador',
        entidadeId: COLABORADOR_ID,
        payload: expect.objectContaining({
          escopo: 'colaborador',
          formato: 'json',
          registros: { escalas: 1, marcacoes: 1, trocasEscala: 1, acessos: 1 },
        }),
      }),
    );
  });

  it('colaborador inexistente → 404', async () => {
    const prisma = criarPrismaFake({ existe: false });
    const GET = criarHandlerExportarDados(prisma as unknown as PrismaClient);

    const response = await GET(req(`http://localhost/api/admin/colaboradores/${COLABORADOR_INEXISTENTE_ID}/exportar-dados?formato=json`), {
      params: Promise.resolve({ id: COLABORADOR_INEXISTENTE_ID }),
    });

    expect(response.status).toBe(404);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});
