/**
 * Testes de aceitação de `specs/04-api/colaborador/API-COL-004-marcar.md`.
 *
 * Mesmo padrão de `src/server/services/marcacoes-admin.test.ts`: Prisma fake
 * injetado (nenhum teste toca banco/Redis real), `registrarAuditoria`
 * mockado para inspecionar o payload sem gravar de verdade.
 *
 * Cobertura por teste da spec:
 * - #1 caminho feliz — bloco "caminho feliz".
 * - #2 (20 paralelas, 1 vaga) — não é testável em unidade sem Postgres real
 *   (é `chk_vagas` + índice único parcial dentro de `marcar_extra`, `FN-005`,
 *   corpo travado por `AGENTS.md`); coberto aqui só o que é testável nesta
 *   camada: `SEM_VAGA` propagado e traduzido para 409.
 * - #3/#4 (idempotência / duplo clique) — responsabilidade de `route.ts`
 *   (`Idempotency-Key` via Redis) e de `marcar_extra` (índice único
 *   `marcacao_unica_confirmada` → `JA_MARCADO`), não deste serviço; a
 *   tradução de `JA_MARCADO` já é coberta por `erros-negocio-extra.test.ts`
 *   e `erros.test.ts` (SQLSTATE `23505`).
 * - #5 (`colaboradorId` de terceiro no body ignorado) — o parâmetro deste
 *   serviço já é `colaboradorId` resolvido pela rota a partir do ator da
 *   sessão; não há como um valor de corpo entrar aqui (garantia por
 *   construção, não checagem — mesma nota do `route.ts`).
 * - #6 (sem `X-Requested-With` → 403) — `defineHandler`/`csrf.ts`, fora
 *   deste módulo.
 * - #7 falha na auditoria reverte a marcação — bloco "auditoria".
 * - #8 (broadcast antes do commit) — responsabilidade de `route.ts`; este
 *   serviço nunca importa `broadcast`, então é estruturalmente impossível de
 *   emitir antes do retorno (que só acontece após o `await` do `$transaction`
 *   resolver).
 * - #9 (rate limit 429) — `defineHandler`, fora deste módulo.
 * - #10 (`lock_timeout` → 503) — SQLSTATE `55P03`, mapeado por
 *   `erroApiParaPostgres` (`src/server/db/erros.ts`), não por
 *   `traduzirErroNegocioExtra` (que só reconhece `RAISE EXCEPTION` de texto);
 *   coberto no bloco "erro de infra propaga intacto" abaixo.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { marcarExtraColaborador, type ClienteMarcarExtra } from './marcar-extra';
import { ErroHttp } from '@/server/http/erros';

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn(async () => ({ id: 'audit-1', hash: 'hash-1' })),
}));
import { registrarAuditoria } from '@/server/audit/registrar';

interface FakeTx {
  $queryRaw: ReturnType<typeof vi.fn>;
  plantao: { findUniqueOrThrow: ReturnType<typeof vi.fn> };
}

function sqlDaChamada(strings: TemplateStringsArray): string {
  return strings.join('?');
}

function criarTxFake(config: {
  marcarExtraResultado?: Array<{ id: string; cruzada: boolean }>;
  marcarExtraErro?: unknown;
  saldo?: { limite: number; usadas: number; restantes: number };
  plantao?: { id: string; data: Date; tipo: string; cicloId: string; rt: { nome: string } };
}): FakeTx {
  const $queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = sqlDaChamada(strings);
    if (sql.includes('marcar_extra')) {
      if (config.marcarExtraErro) throw config.marcarExtraErro;
      return config.marcarExtraResultado ?? [{ id: 'marc-1', cruzada: false }];
    }
    if (sql.includes('saldo_colaborador')) {
      return [{ limite: 5, usadas: 2, restantes: 3, ...config.saldo }];
    }
    throw new Error(`SQL inesperado no fake: ${sql}`);
  });

  return {
    $queryRaw,
    plantao: {
      findUniqueOrThrow: vi.fn(
        async () =>
          config.plantao ?? { id: 'plantao-1', data: new Date('2026-09-10'), tipo: 'DIURNO', cicloId: 'ciclo-1', rt: { nome: 'RT-A' } },
      ),
    },
  };
}

function criarPrismaFake(tx: FakeTx): ClienteMarcarExtra {
  return {
    $transaction: (async (callback: (tx: unknown) => unknown) => callback(tx)) as ClienteMarcarExtra['$transaction'],
  };
}

beforeEach(() => {
  vi.mocked(registrarAuditoria).mockClear();
});

const paramsBase = {
  plantaoId: 'plantao-1',
  colaboradorId: 'colab-1',
  ip: '203.0.113.1',
  userAgent: 'vitest',
  requestId: 'req-1',
};

describe('API-COL-004 marcarExtraColaborador — caminho feliz', () => {
  it('1. devolve id/plantão/tipo/rt/cruzada/saldo — contrato da resposta 201', async () => {
    const tx = criarTxFake({ marcarExtraResultado: [{ id: 'marc-9', cruzada: false }] });
    const resultado = await marcarExtraColaborador(criarPrismaFake(tx), paramsBase);

    expect(resultado.id).toBe('marc-9');
    expect(resultado.plantaoId).toBe('plantao-1');
    expect(resultado.data).toBe('2026-09-10');
    expect(resultado.tipo).toBe('DIURNO');
    expect(resultado.rt).toBe('RT-A');
    expect(resultado.cruzada).toBe(false);
    expect(resultado.saldo).toEqual({ limite: 5, usadas: 2, restantes: 3 });
  });

  it('chama marcar_extra com origem COLABORADOR literal (não ADMIN)', async () => {
    const tx = criarTxFake({});
    await marcarExtraColaborador(criarPrismaFake(tx), paramsBase);

    const chamada = tx.$queryRaw.mock.calls.find((c) => sqlDaChamada(c[0] as TemplateStringsArray).includes('marcar_extra'));
    expect(chamada).toBeDefined();
    expect(sqlDaChamada(chamada![0] as TemplateStringsArray)).toContain("'COLABORADOR'");
    const valores = chamada?.slice(1) ?? [];
    expect(valores).toContain(paramsBase.plantaoId);
    expect(valores).toContain(paramsBase.colaboradorId);
  });

  it('cruzada refletida exatamente como marcar_extra devolveu', async () => {
    const tx = criarTxFake({ marcarExtraResultado: [{ id: 'marc-1', cruzada: true }] });
    const resultado = await marcarExtraColaborador(criarPrismaFake(tx), paramsBase);
    expect(resultado.cruzada).toBe(true);
  });
});

describe('API-COL-004 marcarExtraColaborador — auditoria (#7 falha reverte)', () => {
  it('registra EXTRA_MARCADA dentro da mesma transação, com o payload correto', async () => {
    const tx = criarTxFake({});
    await marcarExtraColaborador(criarPrismaFake(tx), paramsBase);

    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const [txPassado, evento] = vi.mocked(registrarAuditoria).mock.calls[0]!;
    expect(txPassado).toBe(tx);
    expect(evento).toMatchObject({
      atorTipo: 'COLABORADOR',
      atorId: 'colab-1',
      acao: 'EXTRA_MARCADA',
      entidade: 'marcacao',
      entidadeId: 'marc-1',
    });
  });

  it('#7. falha na gravação de auditoria propaga (o $transaction do chamador reverte a marcação junto)', async () => {
    const tx = criarTxFake({});
    const erroAuditoria = new Error('audit_log indisponível');
    vi.mocked(registrarAuditoria).mockRejectedValueOnce(erroAuditoria);

    await expect(marcarExtraColaborador(criarPrismaFake(tx), paramsBase)).rejects.toBe(erroAuditoria);
  });
});

describe('API-COL-004 marcarExtraColaborador — erros de negócio de marcar_extra viram 409/404 traduzidos', () => {
  it.each([
    'PLANTAO_INDISPONIVEL',
    'CICLO_FECHADO',
    'JANELA_NAO_ABERTA',
    'JANELA_ENCERRADA',
    'COLABORADOR_INATIVO',
    'COLABORADOR_BLOQUEADO',
    'CRUZADA_BLOQUEADA',
    'EM_AUSENCIA',
    'CONFLITO_DE_HORARIO',
    'EXCEDE_JORNADA',
    'LIMITE_ATINGIDO',
    'SEM_VAGA',
  ])('%s → ErroHttp 409 com o mesmo código (nunca 500)', async (codigo) => {
    const tx = criarTxFake({ marcarExtraErro: new Error(codigo) });
    await expect(marcarExtraColaborador(criarPrismaFake(tx), paramsBase)).rejects.toMatchObject({
      status: 409,
      codigo,
    });
  });

  it('erro não reconhecido (ex. lock_timeout SQLSTATE 55P03, #10) propaga intacto — traduzido pelo pipeline padrão, não aqui', async () => {
    const erroLockTimeout = { meta: { code: '55P03' } };
    const tx = criarTxFake({ marcarExtraErro: erroLockTimeout });
    await expect(marcarExtraColaborador(criarPrismaFake(tx), paramsBase)).rejects.toBe(erroLockTimeout);
  });

  it('ErroHttp já pronto (ex. erroInterno de "marcar_extra não retornou linha") propaga sem duplicar tradução', async () => {
    const tx = criarTxFake({ marcarExtraResultado: [] });
    await expect(marcarExtraColaborador(criarPrismaFake(tx), paramsBase)).rejects.toBeInstanceOf(ErroHttp);
  });
});
