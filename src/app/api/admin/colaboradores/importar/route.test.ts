/**
 * Testes de `API-ADM-COL-004` — `POST /api/admin/colaboradores/importar`.
 *
 * Rota sem cobertura nenhuma até agora (única entre as rotas admin sem
 * teste) — usuário reportou "acho que não está funcionando" ao testar a
 * importação em lote pela UI; estes testes fecham essa lacuna e servem de
 * verificação end-to-end do handler completo (não só da lógica de parsing).
 *
 * Mesma técnica de injeção de `desbloquear/route.test.ts` (ver doc-comment
 * lá): `defineHandler` real trocado por `criarDefineHandler` com deps fake
 * (sessão admin sempre resolvida, sem precisar de cookie real), Prisma
 * injetado via `criarHandlerImportar(prisma)`.
 */
import { beforeAll, describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import type { AtorAdmin, DependenciasHandler, criarDefineHandler as CriarDefineHandlerFn } from '@/server/http/handler';

const AGORA_FIXA = new Date('2026-09-08T12:00:00.000Z');
const ADMIN: AtorAdmin = { tipo: 'ADMIN', adminId: 'admin-1', email: 'admin@exemplo.com' };

const RT1_ID = '11111111-1111-1111-1111-111111111111';
const RT2_ID = '22222222-2222-2222-2222-222222222222';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:6543/extras?pgbouncer=true';
  process.env.DIRECT_URL ??= 'postgresql://postgres:postgres@localhost:5432/extras';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'teste';
  process.env.SESSION_SECRET ??= 'a'.repeat(32);
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
  rt: { findMany: ReturnType<typeof vi.fn> };
  colaborador: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
}

function criarPrismaFake(config: { matriculasExistentes?: string[] } = {}): FakePrisma {
  const prisma: FakePrisma = {
    rt: {
      findMany: vi.fn(async () => [
        { id: RT1_ID, nome: 'RT1' },
        { id: RT2_ID, nome: 'RT2' },
      ]),
    },
    colaborador: {
      findMany: vi.fn(async ({ where }: { where: { matricula: { in: string[] } } }) => {
        const existentes = config.matriculasExistentes ?? [];
        return where.matricula.in.filter((m) => existentes.includes(m)).map((matricula) => ({ matricula }));
      }),
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  return prisma;
}

function reqComArquivo(conteudo: string, opcoes: { preview?: boolean; nomeCampo?: string } = {}): NextRequest {
  const formData = new FormData();
  formData.set(opcoes.nomeCampo ?? 'arquivo', new Blob([conteudo], { type: 'text/csv' }), 'colaboradores.csv');
  if (opcoes.preview !== undefined) formData.set('preview', opcoes.preview ? 'true' : 'false');

  const headers = new Headers({ 'x-requested-with': 'fetch' });
  return new NextRequest('http://localhost/api/admin/colaboradores/importar', { method: 'POST', headers, body: formData });
}

/** Rota sem segmento dinâmico — `params` ainda é exigido pelo tipo `RotaHandler` (ver `handler.ts`). */
const CTX = { params: Promise.resolve({}) };

let criarHandlerImportar: typeof import('./route').criarHandlerImportar;
let registrarAuditoria: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const modulo = await import('./route');
  criarHandlerImportar = modulo.criarHandlerImportar;
  const auditoria = await import('@/server/audit/registrar');
  registrarAuditoria = vi.mocked(auditoria.registrarAuditoria);
});

beforeEach(() => {
  registrarAuditoria.mockClear();
});

describe('API-ADM-COL-004 POST /api/admin/colaboradores/importar', () => {
  it('CSV válido (2 linhas) → importa as duas, 0 erros', async () => {
    const prisma = criarPrismaFake();
    const POST = criarHandlerImportar(prisma as unknown as PrismaClient);

    const csv = ['99001;Teste Um;RT1;DIURNO;2026-01-05', '99002;Teste Dois;RT2;NOTURNO;2026-01-06'].join('\n');
    const response = await POST(reqComArquivo(csv), CTX);

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo).toMatchObject({ validos: 2, erros: [], importados: 2 });
    expect(prisma.colaborador.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ matricula: '99001', nome: 'Teste Um', rtId: RT1_ID, turnoPadrao: 'DIURNO' }),
        expect.objectContaining({ matricula: '99002', nome: 'Teste Dois', rtId: RT2_ID, turnoPadrao: 'NOTURNO' }),
      ],
    });
  });

  it('preview:true → valida e retorna preview, sem chamar createMany', async () => {
    const prisma = criarPrismaFake();
    const POST = criarHandlerImportar(prisma as unknown as PrismaClient);

    const csv = '99001;Teste Um;RT1;DIURNO;2026-01-05';
    const response = await POST(reqComArquivo(csv, { preview: true }), CTX);

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.validos).toBe(1);
    expect(corpo.preview).toEqual([{ matricula: '99001', nome: 'Teste Um', rtId: RT1_ID, turnoPadrao: 'DIURNO' }]);
    expect(prisma.colaborador.createMany).not.toHaveBeenCalled();
  });

  it('RT inexistente → erro na linha, nada é importado (tudo ou nada)', async () => {
    const prisma = criarPrismaFake();
    const POST = criarHandlerImportar(prisma as unknown as PrismaClient);

    const csv = ['99001;Teste Um;RT1;DIURNO;2026-01-05', '99002;Teste Dois;RT_FANTASMA;NOTURNO;2026-01-06'].join('\n');
    const response = await POST(reqComArquivo(csv), CTX);

    const corpo = await response.json();
    expect(corpo.validos).toBe(1);
    expect(corpo.erros).toEqual([{ linha: 2, campo: 'rt', problema: 'RT não encontrada.' }]);
    expect(corpo.importados).toBeUndefined();
    expect(prisma.colaborador.createMany).not.toHaveBeenCalled();
  });

  it('matrícula duplicada dentro do próprio arquivo → erro nas duas linhas', async () => {
    const prisma = criarPrismaFake();
    const POST = criarHandlerImportar(prisma as unknown as PrismaClient);

    const csv = ['99001;Teste Um;RT1;DIURNO;2026-01-05', '99001;Teste Um De Novo;RT2;NOTURNO;2026-01-06'].join('\n');
    const response = await POST(reqComArquivo(csv), CTX);

    const corpo = await response.json();
    expect(corpo.erros).toHaveLength(2);
    expect(corpo.erros.every((e: { campo: string }) => e.campo === 'matricula')).toBe(true);
    expect(prisma.colaborador.createMany).not.toHaveBeenCalled();
  });

  it('matrícula já cadastrada no banco → erro, nada é importado', async () => {
    const prisma = criarPrismaFake({ matriculasExistentes: ['99001'] });
    const POST = criarHandlerImportar(prisma as unknown as PrismaClient);

    const csv = '99001;Teste Um;RT1;DIURNO;2026-01-05';
    const response = await POST(reqComArquivo(csv), CTX);

    const corpo = await response.json();
    expect(corpo.erros).toEqual([{ linha: 1, campo: 'matricula', problema: 'Matrícula já cadastrada.' }]);
    expect(prisma.colaborador.createMany).not.toHaveBeenCalled();
  });

  it('linha com menos de 5 campos → erro genérico de formato', async () => {
    const prisma = criarPrismaFake();
    const POST = criarHandlerImportar(prisma as unknown as PrismaClient);

    const csv = '99001;Teste Um;RT1;DIURNO';
    const response = await POST(reqComArquivo(csv), CTX);

    const corpo = await response.json();
    expect(corpo.erros).toEqual([
      { linha: 1, campo: '_', problema: 'Linha deve ter 5 campos: matricula;nome;rt;turno;ancora.' },
    ]);
  });

  it('turno inválido (nem DIURNO nem NOTURNO) → erro no campo turno', async () => {
    const prisma = criarPrismaFake();
    const POST = criarHandlerImportar(prisma as unknown as PrismaClient);

    const csv = '99001;Teste Um;RT1;TARDE;2026-01-05';
    const response = await POST(reqComArquivo(csv), CTX);

    const corpo = await response.json();
    expect(corpo.erros).toEqual([{ linha: 1, campo: 'turno', problema: 'Use DIURNO ou NOTURNO.' }]);
  });

  it('data de âncora em formato inválido → erro no campo ancora', async () => {
    const prisma = criarPrismaFake();
    const POST = criarHandlerImportar(prisma as unknown as PrismaClient);

    const csv = '99001;Teste Um;RT1;DIURNO;05/01/2026';
    const response = await POST(reqComArquivo(csv), CTX);

    const corpo = await response.json();
    expect(corpo.erros).toEqual([{ linha: 1, campo: 'ancora', problema: 'Use o formato AAAA-MM-DD.' }]);
  });

  it('sem arquivo no campo "arquivo" → 422', async () => {
    const prisma = criarPrismaFake();
    const POST = criarHandlerImportar(prisma as unknown as PrismaClient);

    const formData = new FormData();
    formData.set('nao-e-o-campo-certo', new Blob(['99001;Teste;RT1;DIURNO;2026-01-05']), 'x.csv');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/colaboradores/importar', {
        method: 'POST',
        headers: { 'x-requested-with': 'fetch' },
        body: formData,
      }),
      CTX,
    );

    expect(response.status).toBe(422);
  });

  it('registra auditoria com o hash do arquivo e as contagens', async () => {
    const prisma = criarPrismaFake();
    const POST = criarHandlerImportar(prisma as unknown as PrismaClient);

    await POST(reqComArquivo('99001;Teste Um;RT1;DIURNO;2026-01-05'), CTX);

    expect(registrarAuditoria).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        atorTipo: 'ADMIN',
        atorId: 'admin-1',
        acao: 'COLABORADOR_CRIADO',
        payload: expect.objectContaining({ acaoEspecifica: 'COLABORADOR_IMPORTADO_LOTE', validos: 1, importados: 1 }),
      }),
    );
  });
});
