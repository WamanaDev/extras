/**
 * API-ADM-PLA-004 — testes de aceitação (`specs/04-api/admin-plantoes/API-ADM-PLA-004-remover.md`)
 * com `tx` mockado, mesmo padrão de `./atualizar.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteTransacao } from '@/server/db/tx';
import type { ContextoAuditoria } from './criar';
import type { RemoverPlantaoInput } from './remover';

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn().mockResolvedValue({ id: 'audit-1', hash: 'hash-1' }),
}));

const travarColaboradoresComBackoff = vi.fn().mockResolvedValue(undefined);
vi.mock('./locks', () => ({
  travarColaboradoresComBackoff: (...args: unknown[]) => travarColaboradoresComBackoff(...args),
}));

const CTX: ContextoAuditoria = { atorId: 'admin-1', ip: '10.0.0.1', userAgent: 'vitest', requestId: 'req-1' };
const PLANTAO_BASE = { id: 'plantao-1', cicloId: 'ciclo-1', ativo: true };
const CICLO_ABERTO = { id: 'ciclo-1', status: 'RASCUNHO' };

interface OverridesTx {
  plantao?: Record<string, unknown> | null;
  ciclo?: Record<string, unknown> | null;
  marcacoesConfirmadas?: Array<{ id: string; colaboradorId: string }>;
}

function criarTxFake(overrides: OverridesTx = {}) {
  const executeRawChamadas: unknown[][] = [];
  const executeRaw = vi.fn().mockImplementation(async (...args: unknown[]) => {
    executeRawChamadas.push(args);
    return undefined;
  });
  const update = vi.fn().mockResolvedValue({ ...PLANTAO_BASE, ativo: false });

  const tx = {
    $executeRaw: executeRaw,
    plantao: {
      findUnique: vi.fn().mockResolvedValue(overrides.plantao === undefined ? PLANTAO_BASE : overrides.plantao),
      update,
    },
    ciclo: { findUnique: vi.fn().mockResolvedValue(overrides.ciclo === undefined ? CICLO_ABERTO : overrides.ciclo) },
    marcacao: { findMany: vi.fn().mockResolvedValue(overrides.marcacoesConfirmadas ?? []) },
  } as unknown as ClienteTransacao;

  return { tx, executeRaw, executeRawChamadas, update };
}

function input(overrides: Partial<RemoverPlantaoInput> = {}): RemoverPlantaoInput {
  return { ...overrides };
}

describe('API-ADM-PLA-004 — removerPlantao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    travarColaboradoresComBackoff.mockResolvedValue(undefined);
  });

  it('1. sem marcações confirmadas — desativado direto, sem locks', async () => {
    const { removerPlantao } = await import('./remover');
    const { tx, update } = criarTxFake({ marcacoesConfirmadas: [] });

    const resultado = await removerPlantao(tx, 'plantao-1', input(), CTX);

    expect(resultado).toEqual({ id: 'plantao-1', ativo: false, marcacoesCanceladas: 0 });
    expect(update).toHaveBeenCalledWith({ where: { id: 'plantao-1' }, data: { ativo: false } });
    expect(travarColaboradoresComBackoff).not.toHaveBeenCalled();
  });

  it('2. com marcações confirmadas, sem confirmar — 409 IMPACTO_NAO_CONFIRMADO com a lista', async () => {
    const { removerPlantao } = await import('./remover');
    const { tx, update } = criarTxFake({ marcacoesConfirmadas: [{ id: 'marc-1', colaboradorId: 'colab-1' }] });

    const erro = await removerPlantao(tx, 'plantao-1', input(), CTX).catch((e) => e);

    expect(erro).toMatchObject({ status: 409, codigo: 'IMPACTO_NAO_CONFIRMADO' });
    expect(erro.detalhes).toHaveProperty('afetado_0', 'colab-1');
    expect(update).not.toHaveBeenCalled();
  });

  it('3. confirmado com motivo — marcações canceladas via FN-006, plantão desativado', async () => {
    const { removerPlantao } = await import('./remover');
    const { tx, executeRawChamadas, update } = criarTxFake({
      marcacoesConfirmadas: [
        { id: 'marc-1', colaboradorId: 'colab-1' },
        { id: 'marc-2', colaboradorId: 'colab-2' },
      ],
    });

    const resultado = await removerPlantao(
      tx,
      'plantao-1',
      input({ confirmarCancelamentos: true, motivo: 'RT reduziu efetivo neste dia' }),
      CTX,
    );

    expect(resultado.marcacoesCanceladas).toBe(2);
    expect(resultado.ativo).toBe(false);
    expect(update).toHaveBeenCalledWith({ where: { id: 'plantao-1' }, data: { ativo: false } });
    // FN-006 `cancelar_extra` chamado uma vez por marcação confirmada, além do FOR UPDATE inicial.
    expect(executeRawChamadas.length).toBeGreaterThanOrEqual(3); // 1 FOR UPDATE + 2 cancelar_extra
    expect(travarColaboradoresComBackoff).toHaveBeenCalledWith(tx, ['colab-1', 'colab-2']);
  });

  it('4. remoção nunca é DELETE físico — sempre plantao.update({ ativo: false })', async () => {
    const { removerPlantao } = await import('./remover');
    const { tx } = criarTxFake({ marcacoesConfirmadas: [] });
    const deleteFn = vi.fn();
    (tx as unknown as { plantao: { delete: typeof deleteFn } }).plantao.delete = deleteFn;

    await removerPlantao(tx, 'plantao-1', input(), CTX);

    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('5. motivo ausente com cancelamentos confirmados — 422 MOTIVO_OBRIGATORIO', async () => {
    const { removerPlantao } = await import('./remover');
    const { tx, update } = criarTxFake({ marcacoesConfirmadas: [{ id: 'marc-1', colaboradorId: 'colab-1' }] });

    const erro = await removerPlantao(tx, 'plantao-1', input({ confirmarCancelamentos: true }), CTX).catch((e) => e);

    expect(erro).toMatchObject({ status: 422, codigo: 'MOTIVO_OBRIGATORIO' });
    expect(update).not.toHaveBeenCalled();
  });

  it('motivo só de espaços em branco é tratado como ausente', async () => {
    const { removerPlantao } = await import('./remover');
    const { tx } = criarTxFake({ marcacoesConfirmadas: [{ id: 'marc-1', colaboradorId: 'colab-1' }] });

    await expect(
      removerPlantao(tx, 'plantao-1', input({ confirmarCancelamentos: true, motivo: '   ' }), CTX),
    ).rejects.toMatchObject({ status: 422, codigo: 'MOTIVO_OBRIGATORIO' });
  });

  it('ciclo fechado — 409 CICLO_FECHADO', async () => {
    const { removerPlantao } = await import('./remover');
    const { tx } = criarTxFake({ ciclo: { ...CICLO_ABERTO, status: 'FECHADO' } });

    await expect(removerPlantao(tx, 'plantao-1', input(), CTX)).rejects.toMatchObject({ status: 409, codigo: 'CICLO_FECHADO' });
  });

  it('plantão inexistente — 404, nunca 403', async () => {
    const { removerPlantao } = await import('./remover');
    const { tx } = criarTxFake({ plantao: null });

    await expect(removerPlantao(tx, 'plantao-x', input(), CTX)).rejects.toMatchObject({ status: 404 });
  });

  it('auditoria com motivo e afetados', async () => {
    const { removerPlantao } = await import('./remover');
    const { tx } = criarTxFake({ marcacoesConfirmadas: [{ id: 'marc-1', colaboradorId: 'colab-1' }] });

    await removerPlantao(tx, 'plantao-1', input({ confirmarCancelamentos: true, motivo: 'ajuste de escala' }), CTX);

    const { registrarAuditoria } = await import('@/server/audit/registrar');
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        acao: 'PLANTAO_REMOVIDO',
        payload: expect.objectContaining({ motivo: 'ajuste de escala', afetados: ['colab-1'] }),
      }),
    );
  });
});
