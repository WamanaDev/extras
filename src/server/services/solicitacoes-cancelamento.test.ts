/**
 * Testes de `@/server/services/solicitacoes-cancelamento` — pedido do
 * usuário: qualquer admin aprova ou recusa um pedido de cancelamento de
 * extra aberto pelo colaborador.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { registrarAuditoria } from '@/server/audit/registrar';
import { criarNotificacao } from '@/server/notificacoes/criar';
import {
  aprovarSolicitacaoCancelamento,
  recusarSolicitacaoCancelamento,
  listarSolicitacoesCancelamento,
  type ClienteSolicitacoesBanco,
} from './solicitacoes-cancelamento';

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn(async () => ({ id: 'audit-1', hash: 'hash-1' })),
}));
vi.mock('@/server/notificacoes/criar', () => ({
  criarNotificacao: vi.fn(async () => ({ id: 'notif-1' })),
}));

function sqlDaChamada(strings: TemplateStringsArray): string {
  return strings.join('?');
}

const PARAMS_BASE = { solicitacaoId: 'sol-1', adminId: 'admin-1', ip: '203.0.113.1', userAgent: 'vitest', requestId: 'req-1' };

interface FakeClient {
  $transaction: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
  solicitacaoCancelamento: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
}

function criarClienteFake(config: {
  solicitacao?: { id: string; marcacaoId: string; colaboradorId: string; status: string } | null;
  cancelarExtraResultado?: Array<{ id: string; status: string; plantaoId: string }>;
  cancelarExtraErro?: unknown;
  listagem?: unknown[];
  total?: number;
}): FakeClient {
  const solicitacaoAtual = { ...(config.solicitacao === undefined ? { id: 'sol-1', marcacaoId: 'marc-1', colaboradorId: 'colab-1', status: 'PENDENTE' } : config.solicitacao) };

  const $queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = sqlDaChamada(strings);
    if (sql.includes('cancelar_extra')) {
      if (config.cancelarExtraErro) throw config.cancelarExtraErro;
      return config.cancelarExtraResultado ?? [{ id: 'marc-1', status: 'CANCELADA', plantaoId: 'plantao-1' }];
    }
    throw new Error(`SQL inesperado no fake: ${sql}`);
  });

  const client: FakeClient = {
    $queryRaw,
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(client)),
    solicitacaoCancelamento: {
      findUnique: vi.fn(async () => (config.solicitacao === null ? null : solicitacaoAtual)),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => ({ ...solicitacaoAtual, ...args.data })),
      findMany: vi.fn(async () => config.listagem ?? []),
      count: vi.fn(async () => config.total ?? 0),
    },
  };
  return client;
}

beforeEach(() => {
  vi.mocked(registrarAuditoria).mockClear();
  vi.mocked(criarNotificacao).mockClear();
});

describe('aprovarSolicitacaoCancelamento', () => {
  it('caminho feliz — chama cancelar_extra com origem ADMIN, marca APROVADA, audita, notifica o colaborador', async () => {
    const client = criarClienteFake({});
    const resultado = await aprovarSolicitacaoCancelamento(client as unknown as ClienteSolicitacoesBanco, PARAMS_BASE);

    expect(resultado).toEqual({ id: 'sol-1', status: 'APROVADA', marcacaoId: 'marc-1', colaboradorId: 'colab-1' });

    const chamadaCancelar = client.$queryRaw.mock.calls.find((c) => sqlDaChamada(c[0] as TemplateStringsArray).includes('cancelar_extra'));
    expect(chamadaCancelar?.slice(1)).toEqual(['marc-1', 'admin-1']);

    expect(client.solicitacaoCancelamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APROVADA', resolvidoPorId: 'admin-1' }) }),
    );
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ acao: 'CANCELAMENTO_APROVADO' }));
    expect(criarNotificacao).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ colaboradorId: 'colab-1', tipo: 'CANCELAMENTO_APROVADO' }));
  });

  it('"qualquer admin" — nenhuma checagem de qual admin abriu ou de qual admin resolve', async () => {
    const client = criarClienteFake({});
    await expect(
      aprovarSolicitacaoCancelamento(client as unknown as ClienteSolicitacoesBanco, { ...PARAMS_BASE, adminId: 'admin-outro-qualquer' }),
    ).resolves.toBeDefined();
  });

  it('solicitação inexistente → 404, nunca chama cancelar_extra', async () => {
    const client = criarClienteFake({ solicitacao: null });
    await expect(aprovarSolicitacaoCancelamento(client as unknown as ClienteSolicitacoesBanco, PARAMS_BASE)).rejects.toMatchObject({ status: 404 });
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });

  it('solicitação já resolvida (não PENDENTE) → 409, nunca chama cancelar_extra de novo', async () => {
    const client = criarClienteFake({ solicitacao: { id: 'sol-1', marcacaoId: 'marc-1', colaboradorId: 'colab-1', status: 'APROVADA' } });
    await expect(aprovarSolicitacaoCancelamento(client as unknown as ClienteSolicitacoesBanco, PARAMS_BASE)).rejects.toMatchObject({ status: 409 });
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });

  it('cancelar_extra rejeita (ex.: CICLO_FECHADO) → propaga intacto, solicitação não é atualizada', async () => {
    const erroPg = { meta: { code: 'P0001', message: 'ERROR:  CICLO_FECHADO' } };
    const client = criarClienteFake({ cancelarExtraErro: erroPg });
    await expect(aprovarSolicitacaoCancelamento(client as unknown as ClienteSolicitacoesBanco, PARAMS_BASE)).rejects.toBe(erroPg);
    expect(client.solicitacaoCancelamento.update).not.toHaveBeenCalled();
  });

  it('falha ao notificar não derruba a aprovação já commitada', async () => {
    vi.mocked(criarNotificacao).mockRejectedValueOnce(new Error('push indisponível'));
    const client = criarClienteFake({});
    await expect(aprovarSolicitacaoCancelamento(client as unknown as ClienteSolicitacoesBanco, PARAMS_BASE)).resolves.toMatchObject({ status: 'APROVADA' });
  });
});

describe('recusarSolicitacaoCancelamento', () => {
  const paramsRecusar = { ...PARAMS_BASE, motivoResolucao: 'Cobertura insuficiente nesse dia.' };

  it('caminho feliz — nunca chama cancelar_extra, marca RECUSADA com o motivo, audita, notifica', async () => {
    const client = criarClienteFake({});
    const resultado = await recusarSolicitacaoCancelamento(client as unknown as ClienteSolicitacoesBanco, paramsRecusar);

    expect(resultado).toEqual({ id: 'sol-1', status: 'RECUSADA', marcacaoId: 'marc-1', colaboradorId: 'colab-1' });
    expect(client.$queryRaw).not.toHaveBeenCalled();
    expect(client.solicitacaoCancelamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RECUSADA', motivoResolucao: 'Cobertura insuficiente nesse dia.' }) }),
    );
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ acao: 'CANCELAMENTO_RECUSADO' }));
    expect(criarNotificacao).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ colaboradorId: 'colab-1', tipo: 'CANCELAMENTO_RECUSADO' }));
  });

  it('solicitação já resolvida → 409', async () => {
    const client = criarClienteFake({ solicitacao: { id: 'sol-1', marcacaoId: 'marc-1', colaboradorId: 'colab-1', status: 'RECUSADA' } });
    await expect(recusarSolicitacaoCancelamento(client as unknown as ClienteSolicitacoesBanco, paramsRecusar)).rejects.toMatchObject({ status: 409 });
  });
});

describe('listarSolicitacoesCancelamento', () => {
  it('filtra por status quando informado', async () => {
    const client = criarClienteFake({ listagem: [], total: 0 });
    await listarSolicitacoesCancelamento(client as unknown as ClienteSolicitacoesBanco, { status: 'PENDENTE', pagina: 1, tamanho: 20 });

    expect(client.solicitacaoCancelamento.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'PENDENTE' } }));
    expect(client.solicitacaoCancelamento.count).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'PENDENTE' } }));
  });

  it('sem status → lista tudo (where vazio)', async () => {
    const client = criarClienteFake({ listagem: [], total: 0 });
    await listarSolicitacoesCancelamento(client as unknown as ClienteSolicitacoesBanco, { pagina: 1, tamanho: 20 });

    expect(client.solicitacaoCancelamento.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});
