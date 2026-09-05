/**
 * Testes de rota de `API-ADM-ESC-004` — `GET /api/admin/ciclos/:id/escala/export`.
 *
 * Cobre da tabela "Testes de aceitação": #3 (`observacao` ausente — aqui
 * verificado na fronteira: a grade repassada a `gerarPdf`/`gerarXlsx` nunca
 * tem `observacao`, mesmo vindo de `buscarGrade` com observação), #5
 * (auditoria `EXPORTACAO_DADOS` registrada) e o contrato de resposta
 * binária (`Content-Type`/`Content-Disposition`, `route.ts` "Passo 1:
 * Reusar API-ADM-ESC-001"). #1/#2/#4/#6 (PDF/XLSX em si — layout A4,
 * legenda, rodapé, monocromático) são cobertos em `export.test.ts`, que
 * testa `gerarPdf`/`gerarXlsx` diretamente.
 *
 * Mesma técnica de injeção de `criarDefineHandler` de
 * `../route.test.ts`/`API-000` — o pipeline real roda, só sessão/rate
 * limit/relógio são substituídos.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { AtorAdmin, SessaoResolvida } from '@/server/http/handler';
import type { GradeSaida } from '@/server/services/escala-admin/grade';

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

const ADMIN: AtorAdmin = { tipo: 'ADMIN', adminId: 'admin-1', email: null };
const sessaoAtual: SessaoResolvida | null = ADMIN;

vi.mock('@/server/http/handler', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/server/http/handler')>();
  const fakeDefineHandler = real.criarDefineHandler({
    relogio: () => new Date('2026-09-04T12:00:00-03:00'),
    resolverSessao: async () => sessaoAtual,
    verificarLimite: async () => ({ permitido: true, limite: 10, restante: 9, retryAfter: 0 }),
    registrarLog: () => {},
    gerarRequestId: () => 'req-1',
  });
  return { ...real, defineHandler: fakeDefineHandler };
});

const CICLO_ID = '11111111-1111-1111-1111-111111111111';

const GRADE_COM_OBSERVACAO: GradeSaida = {
  ciclo: { ano: 2026, mes: 9, dias: 30 },
  colaboradores: [
    {
      id: 'c1',
      nome: 'Ana',
      matricula: '0001',
      rt: 'RT-A',
      turnoPadrao: 'DIURNO',
      paridade: 'IMPAR',
      dias: { 1: { escalaDiaId: 'ed1', codigo: 'F', turno: 'DIURNO', temExtra: false, observacao: 'Atestado médico' } },
      extras: [],
      totais: { trabalhados: 0, folgas: 1, extras: 0, horas: 0 },
    },
  ],
  codigos: [{ codigo: 'F', descricao: 'Folga', cor: '#111', presenca: false, ocupaHorario: false }],
  coberturaPorDia: {},
};

vi.mock('@/server/services/escala-admin/consulta', () => ({
  buscarGrade: async () => GRADE_COM_OBSERVACAO,
}));

const registrarAuditoriaMock = vi.fn().mockResolvedValue({ id: 'audit-1', hash: 'hash-1' });
vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: (...args: unknown[]) => registrarAuditoriaMock(...args),
}));

vi.mock('@/server/db/client', () => ({
  obterPrisma: async () => ({
    $transaction: (callback: (tx: unknown) => unknown) => callback({}),
  }),
}));

const gerarPdfMock = vi.fn().mockResolvedValue(Buffer.from('%PDF-fake'));
const gerarXlsxMock = vi.fn().mockResolvedValue(Buffer.from('xlsx-fake'));
vi.mock('@/server/services/escala-admin/export', () => ({
  gerarPdf: (...args: unknown[]) => gerarPdfMock(...args),
  gerarXlsx: (...args: unknown[]) => gerarXlsxMock(...args),
}));

function req(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET', headers: new Headers() });
}

describe('GET /api/admin/ciclos/:id/escala/export — API-ADM-ESC-004', () => {
  beforeEach(() => {
    registrarAuditoriaMock.mockClear();
    gerarPdfMock.mockClear();
    gerarXlsxMock.mockClear();
  });

  it('3. `observacao` nunca chega a `gerarPdf` — grade filtrada por `removerObservacoes` antes', async () => {
    const { GET } = await import('./route');

    await GET(req(`http://localhost/api/admin/ciclos/${CICLO_ID}/escala/export?formato=pdf`), { params: Promise.resolve({ id: CICLO_ID }) });

    expect(gerarPdfMock).toHaveBeenCalledTimes(1);
    const gradePassada = gerarPdfMock.mock.calls[0]![0] as GradeSaida;
    expect(gradePassada.colaboradores[0]!.dias[1]).not.toHaveProperty('observacao');
    expect(gradePassada.colaboradores[0]!.dias[1]!.codigo).toBe('F');
  });

  it('resposta binária: `Content-Type` de PDF e `Content-Disposition: attachment`', async () => {
    const { GET } = await import('./route');

    const resposta = await GET(req(`http://localhost/api/admin/ciclos/${CICLO_ID}/escala/export?formato=pdf`), { params: Promise.resolve({ id: CICLO_ID }) });

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Content-Type')).toBe('application/pdf');
    expect(resposta.headers.get('Content-Disposition')).toContain('attachment');
    const corpo = Buffer.from(await resposta.arrayBuffer());
    expect(corpo.toString('ascii')).toBe('%PDF-fake');
  });

  it('formato xlsx: `Content-Type` de planilha', async () => {
    const { GET } = await import('./route');

    const resposta = await GET(req(`http://localhost/api/admin/ciclos/${CICLO_ID}/escala/export?formato=xlsx`), { params: Promise.resolve({ id: CICLO_ID }) });

    expect(resposta.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(gerarXlsxMock).toHaveBeenCalledTimes(1);
  });

  it('5. auditoria `EXPORTACAO_DADOS` registrada com formato e nº de registros', async () => {
    const { GET } = await import('./route');

    await GET(req(`http://localhost/api/admin/ciclos/${CICLO_ID}/escala/export?formato=pdf`), { params: Promise.resolve({ id: CICLO_ID }) });

    expect(registrarAuditoriaMock).toHaveBeenCalledTimes(1);
    const evento = registrarAuditoriaMock.mock.calls[0]![1] as { acao: string; payload: unknown; entidadeId: string };
    expect(evento.acao).toBe('EXPORTACAO_DADOS');
    expect(evento.entidadeId).toBe(CICLO_ID);
    expect(evento.payload).toMatchObject({ formato: 'pdf', registros: 30 }); // 1 colaborador x 30 dias
  });

  it('formato inválido → 422 (validação Zod)', async () => {
    const { GET } = await import('./route');

    const resposta = await GET(req(`http://localhost/api/admin/ciclos/${CICLO_ID}/escala/export?formato=doc`), { params: Promise.resolve({ id: CICLO_ID }) });

    expect(resposta.status).toBe(422);
  });
});
