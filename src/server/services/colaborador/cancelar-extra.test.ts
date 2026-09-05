/**
 * Testes de aceitação de `specs/04-api/colaborador/API-COL-005-cancelar.md`.
 *
 * - #1 cancelamento na janela — bloco "caminho feliz".
 * - #2 após fechamento → `JANELA_ENCERRADA` — bloco "erros de negócio".
 * - #3/#4 de terceiro / inexistente → 404 uniforme — `cancelar_extra` (FN-006)
 *   já resolve isso via `MARCACAO_INEXISTENTE` (mesmo texto para os dois
 *   casos, `SEC-CONF`) — coberto no bloco "erros de negócio".
 * - #5 2× idempotente — bloco "idempotência".
 * - #6 remarcar depois — fora do escopo deste serviço (é `marcarExtraColaborador`
 *   de novo, já coberto em `marcar-extra.test.ts`).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cancelarExtraColaborador, type ClienteCancelarExtra } from './cancelar-extra';

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
  cancelarExtraResultado?: Array<{ id: string; status: string; plantaoId: string; colaboradorId: string }>;
  cancelarExtraErro?: unknown;
  saldo?: { limite: number; usadas: number; restantes: number };
  plantao?: { cicloId: string };
}): FakeTx {
  const $queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = sqlDaChamada(strings);
    if (sql.includes('cancelar_extra')) {
      if (config.cancelarExtraErro) throw config.cancelarExtraErro;
      return config.cancelarExtraResultado ?? [{ id: 'marc-1', status: 'CANCELADA', plantaoId: 'plantao-1', colaboradorId: 'colab-1' }];
    }
    if (sql.includes('saldo_colaborador')) {
      return [{ limite: 5, usadas: 1, restantes: 4, ...config.saldo }];
    }
    throw new Error(`SQL inesperado no fake: ${sql}`);
  });

  return {
    $queryRaw,
    plantao: { findUniqueOrThrow: vi.fn(async () => config.plantao ?? { cicloId: 'ciclo-1' }) },
  };
}

function criarPrismaFake(tx: FakeTx): ClienteCancelarExtra {
  return {
    $transaction: (async (callback: (tx: unknown) => unknown) => callback(tx)) as ClienteCancelarExtra['$transaction'],
  };
}

beforeEach(() => {
  vi.mocked(registrarAuditoria).mockClear();
});

const paramsBase = {
  marcacaoId: 'marc-1',
  colaboradorId: 'colab-1',
  ip: '203.0.113.1',
  userAgent: 'vitest',
  requestId: 'req-1',
};

describe('API-COL-005 cancelarExtraColaborador — caminho feliz', () => {
  it('1. devolve status CANCELADA + saldo atualizado', async () => {
    const tx = criarTxFake({});
    const resultado = await cancelarExtraColaborador(criarPrismaFake(tx), paramsBase);

    expect(resultado.id).toBe('marc-1');
    expect(resultado.status).toBe('CANCELADA');
    expect(resultado.saldo).toEqual({ limite: 5, usadas: 1, restantes: 4 });
  });

  it('chama cancelar_extra com (marcacaoId, colaboradorId da sessão, "COLABORADOR")', async () => {
    const tx = criarTxFake({});
    await cancelarExtraColaborador(criarPrismaFake(tx), paramsBase);

    const chamada = tx.$queryRaw.mock.calls.find((c) => sqlDaChamada(c[0] as TemplateStringsArray).includes('cancelar_extra'));
    expect(chamada).toBeDefined();
    expect(sqlDaChamada(chamada![0] as TemplateStringsArray)).toContain("'COLABORADOR'");
    const valores = chamada?.slice(1) ?? [];
    expect(valores).toContain(paramsBase.marcacaoId);
    expect(valores).toContain(paramsBase.colaboradorId);
  });

  it('auditoria EXTRA_CANCELADA gravada dentro da mesma transação', async () => {
    const tx = criarTxFake({});
    await cancelarExtraColaborador(criarPrismaFake(tx), paramsBase);

    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const [txPassado, evento] = vi.mocked(registrarAuditoria).mock.calls[0]!;
    expect(txPassado).toBe(tx);
    expect(evento).toMatchObject({
      atorTipo: 'COLABORADOR',
      atorId: 'colab-1',
      acao: 'EXTRA_CANCELADA',
      entidade: 'marcacao',
      entidadeId: 'marc-1',
    });
  });
});

describe('API-COL-005 cancelarExtraColaborador — idempotência (#5)', () => {
  it('chamado 2× na mesma marcação já CANCELADA: sem erro, mesmo resultado — decremento único é garantido por cancelar_extra (FN-006), este serviço só repassa', async () => {
    const tx = criarTxFake({ cancelarExtraResultado: [{ id: 'marc-1', status: 'CANCELADA', plantaoId: 'plantao-1', colaboradorId: 'colab-1' }] });
    const primeira = await cancelarExtraColaborador(criarPrismaFake(tx), paramsBase);
    const segunda = await cancelarExtraColaborador(criarPrismaFake(tx), paramsBase);

    expect(primeira.status).toBe('CANCELADA');
    expect(segunda.status).toBe('CANCELADA');
    // Auditoria gravada nas duas chamadas — cada uma é um evento de tentativa
    // independente, não uma segunda mutação de estado (mesma decisão de
    // cancelarExtraAdmin, API-ADM-MAR-003).
    expect(registrarAuditoria).toHaveBeenCalledTimes(2);
  });
});

describe('API-COL-005 cancelarExtraColaborador — erros de negócio (#2, #3, #4)', () => {
  it('#2. após o fechamento da janela → JANELA_ENCERRADA, 409', async () => {
    const tx = criarTxFake({ cancelarExtraErro: new Error('JANELA_ENCERRADA') });
    await expect(cancelarExtraColaborador(criarPrismaFake(tx), paramsBase)).rejects.toMatchObject({
      status: 409,
      codigo: 'JANELA_ENCERRADA',
    });
  });

  it('#3/#4. marcação de terceiro ou inexistente → 404 RECURSO_NAO_ENCONTRADO (mesma resposta uniforme, SEC-CONF)', async () => {
    const tx = criarTxFake({ cancelarExtraErro: new Error('MARCACAO_INEXISTENTE') });
    await expect(cancelarExtraColaborador(criarPrismaFake(tx), paramsBase)).rejects.toMatchObject({
      status: 404,
      codigo: 'RECURSO_NAO_ENCONTRADO',
    });
  });

  it('ciclo fechado → CICLO_FECHADO, 409', async () => {
    const tx = criarTxFake({ cancelarExtraErro: new Error('CICLO_FECHADO') });
    await expect(cancelarExtraColaborador(criarPrismaFake(tx), paramsBase)).rejects.toMatchObject({
      status: 409,
      codigo: 'CICLO_FECHADO',
    });
  });
});
