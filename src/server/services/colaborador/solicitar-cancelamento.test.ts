/**
 * Testes de `solicitarCancelamentoColaborador` — pedido do usuário:
 * colaborador não cancela mais a própria extra direto, abre um pedido.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { registrarAuditoria } from '@/server/audit/registrar';
import { solicitarCancelamentoColaborador, type ClienteSolicitarCancelamento } from './solicitar-cancelamento';

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn(async () => ({ id: 'audit-1', hash: 'hash-1' })),
}));

const PARAMS_BASE = {
  marcacaoId: 'marc-1',
  colaboradorId: 'colab-1',
  motivo: 'Imprevisto pessoal',
  ip: '203.0.113.1',
  userAgent: 'vitest',
  requestId: 'req-1',
};

interface FakeTx {
  marcacao: { findFirst: ReturnType<typeof vi.fn> };
  solicitacaoCancelamento: { findFirst: ReturnType<typeof vi.fn>; findFirstOrThrow: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
}

function criarTxFake(config: {
  marcacao?: { id: string; status: string; plantao: { ciclo: { status: string } } } | null;
  solicitacaoPendente?: { id: string } | null;
  erroCreate?: unknown;
  criada?: { id: string };
}): FakeTx {
  return {
    marcacao: {
      findFirst: vi.fn(async () =>
        config.marcacao === undefined
          ? { id: 'marc-1', status: 'CONFIRMADA', plantao: { ciclo: { status: 'PUBLICADO' } } }
          : config.marcacao,
      ),
    },
    solicitacaoCancelamento: {
      findFirst: vi.fn(async () => (config.solicitacaoPendente === undefined ? null : config.solicitacaoPendente)),
      findFirstOrThrow: vi.fn(async () => config.solicitacaoPendente ?? { id: 'sol-corrida' }),
      create: vi.fn(async () => {
        if (config.erroCreate) throw config.erroCreate;
        return config.criada ?? { id: 'sol-1' };
      }),
    },
  };
}

function criarPrismaFake(tx: FakeTx): ClienteSolicitarCancelamento {
  return {
    $transaction: (async (callback: (tx: unknown) => unknown) => callback(tx)) as ClienteSolicitarCancelamento['$transaction'],
  };
}

beforeEach(() => {
  vi.mocked(registrarAuditoria).mockClear();
});

describe('solicitarCancelamentoColaborador', () => {
  it('caminho feliz — cria a solicitação PENDENTE, audita, jaExistia = false', async () => {
    const tx = criarTxFake({ criada: { id: 'sol-9' } });
    const resultado = await solicitarCancelamentoColaborador(criarPrismaFake(tx), PARAMS_BASE);

    expect(resultado).toEqual({ id: 'sol-9', marcacaoId: 'marc-1', status: 'PENDENTE', jaExistia: false });
    expect(tx.solicitacaoCancelamento.create).toHaveBeenCalledWith({
      data: { marcacaoId: 'marc-1', colaboradorId: 'colab-1', motivo: 'Imprevisto pessoal' },
    });
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ acao: 'CANCELAMENTO_SOLICITADO', atorTipo: 'COLABORADOR', atorId: 'colab-1' }),
    );
  });

  it('marcação de terceiro ou inexistente → 404 uniforme (SEC-CONF), nunca cria solicitação', async () => {
    const tx = criarTxFake({ marcacao: null });
    await expect(solicitarCancelamentoColaborador(criarPrismaFake(tx), PARAMS_BASE)).rejects.toMatchObject({ status: 404 });
    expect(tx.solicitacaoCancelamento.create).not.toHaveBeenCalled();
  });

  it('marcação já CANCELADA → 409, nunca cria solicitação', async () => {
    const tx = criarTxFake({ marcacao: { id: 'marc-1', status: 'CANCELADA', plantao: { ciclo: { status: 'PUBLICADO' } } } });
    await expect(solicitarCancelamentoColaborador(criarPrismaFake(tx), PARAMS_BASE)).rejects.toMatchObject({ status: 409 });
    expect(tx.solicitacaoCancelamento.create).not.toHaveBeenCalled();
  });

  it('ciclo FECHADO → 409, nunca cria solicitação', async () => {
    const tx = criarTxFake({ marcacao: { id: 'marc-1', status: 'CONFIRMADA', plantao: { ciclo: { status: 'FECHADO' } } } });
    await expect(solicitarCancelamentoColaborador(criarPrismaFake(tx), PARAMS_BASE)).rejects.toMatchObject({ status: 409 });
    expect(tx.solicitacaoCancelamento.create).not.toHaveBeenCalled();
  });

  it('já existe um pedido PENDENTE → devolve o mesmo, jaExistia = true, não cria outro', async () => {
    const tx = criarTxFake({ solicitacaoPendente: { id: 'sol-existente' } });
    const resultado = await solicitarCancelamentoColaborador(criarPrismaFake(tx), PARAMS_BASE);

    expect(resultado).toEqual({ id: 'sol-existente', marcacaoId: 'marc-1', status: 'PENDENTE', jaExistia: true });
    expect(tx.solicitacaoCancelamento.create).not.toHaveBeenCalled();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  it('corrida: create rejeita por violação de unicidade (23505) → devolve a que já existe em vez de propagar erro', async () => {
    const tx = criarTxFake({ erroCreate: { meta: { code: '23505' } }, solicitacaoPendente: { id: 'sol-corrida' } });
    const resultado = await solicitarCancelamentoColaborador(criarPrismaFake(tx), PARAMS_BASE);

    expect(resultado).toEqual({ id: 'sol-corrida', marcacaoId: 'marc-1', status: 'PENDENTE', jaExistia: true });
  });

  it('erro de create que não é violação de unicidade propaga intacto', async () => {
    const erroInesperado = new Error('conexão perdida');
    const tx = criarTxFake({ erroCreate: erroInesperado });
    await expect(solicitarCancelamentoColaborador(criarPrismaFake(tx), PARAMS_BASE)).rejects.toBe(erroInesperado);
  });
});
