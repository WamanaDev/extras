/**
 * API-ADM-PLA-001 — testes de aceitação (tabela da spec,
 * `specs/04-api/admin-plantoes/API-ADM-PLA-001-criar.md`) com `tx` (Prisma)
 * mockado, mesmo padrão de `src/server/ciclos/criar.test.ts`.
 *
 * `criarPlantao` recebe `ClienteTransacao` diretamente (não `PrismaClient`) —
 * a fronteira de transação (`emTransacao`) já é responsabilidade do
 * `route.ts`, então o teste injeta o `tx` fake direto, sem precisar mockar
 * `$transaction`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteTransacao } from '@/server/db/tx';
import type { ContextoAuditoria } from './criar';

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn().mockResolvedValue({ id: 'audit-1', hash: 'hash-1' }),
}));

const CTX: ContextoAuditoria = { atorId: 'admin-1', ip: '10.0.0.1', userAgent: 'vitest', requestId: 'req-1' };

const CICLO_ABERTO = { id: 'ciclo-1', ano: 2026, mes: 9, status: 'RASCUNHO' };

function criarTxFake(overrides: {
  ciclo?: Record<string, unknown> | null;
  plantaoCriado?: Record<string, unknown>;
  erroCreate?: unknown;
} = {}): { tx: ClienteTransacao; create: ReturnType<typeof vi.fn> } {
  const create = overrides.erroCreate
    ? vi.fn().mockRejectedValue(overrides.erroCreate)
    : vi.fn().mockResolvedValue(overrides.plantaoCriado ?? { id: 'plantao-1' });

  const tx = {
    ciclo: { findUnique: vi.fn().mockResolvedValue(overrides.ciclo === undefined ? CICLO_ABERTO : overrides.ciclo) },
    plantao: { create },
  } as unknown as ClienteTransacao;

  return { tx, create };
}

describe('API-ADM-PLA-001 — criarPlantao', () => {
  beforeEach(() => vi.clearAllMocks());

  const inputBase = {
    cicloId: 'ciclo-1',
    rtId: 'rt-1',
    data: new Date('2026-09-04T00:00:00.000Z'),
    tipo: 'DIURNO' as const,
    vagasTotais: 3,
    permiteCruzada: null,
  };

  it('1. criação válida — 201 (implícito), plantão criado e intervalo delegado à trigger', async () => {
    const { criarPlantao } = await import('./criar');
    const { tx, create } = criarTxFake({ plantaoCriado: { id: 'plantao-1', vagasTotais: 3 } });

    const resultado = await criarPlantao(tx, inputBase, CTX);

    expect(resultado.id).toBe('plantao-1');
    // a função nunca escreve inicioEm/fimEm — trigger `preencher_intervalo` calcula.
    const dadosEnviados = create.mock.calls[0]?.[0]?.data;
    expect(dadosEnviados).not.toHaveProperty('inicioEm');
    expect(dadosEnviados).not.toHaveProperty('fimEm');
    const { registrarAuditoria } = await import('@/server/audit/registrar');
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ acao: 'PLANTAO_CRIADO', atorId: 'admin-1', entidade: 'plantao', entidadeId: 'plantao-1' }),
    );
  });

  it('2. duplicado (mesmo ciclo/rt/data/tipo) — 409 PLANTAO_JA_EXISTE via violação de unicidade (23505)', async () => {
    const { criarPlantao } = await import('./criar');
    const { tx } = criarTxFake({ erroCreate: { code: '23505', meta: { code: '23505' } } });

    await expect(criarPlantao(tx, inputBase, CTX)).rejects.toMatchObject({ status: 409, codigo: 'PLANTAO_JA_EXISTE' });
  });

  it('3. data fora do mês do ciclo — 422 DATA_FORA_DO_CICLO', async () => {
    const { criarPlantao } = await import('./criar');
    const { tx } = criarTxFake();

    await expect(
      criarPlantao(tx, { ...inputBase, data: new Date('2026-10-01T00:00:00.000Z') }, CTX),
    ).rejects.toMatchObject({ status: 422, codigo: 'DATA_FORA_DO_CICLO' });
  });

  it('4. ciclo fechado — 409 CICLO_FECHADO', async () => {
    const { criarPlantao } = await import('./criar');
    const { tx } = criarTxFake({ ciclo: { ...CICLO_ABERTO, status: 'FECHADO' } });

    await expect(criarPlantao(tx, inputBase, CTX)).rejects.toMatchObject({ status: 409, codigo: 'CICLO_FECHADO' });
  });

  it('5. permiteCruzada: null — herda do ciclo (gravado como null, não false)', async () => {
    const { criarPlantao } = await import('./criar');
    const { tx, create } = criarTxFake();

    await criarPlantao(tx, { ...inputBase, permiteCruzada: null }, CTX);

    expect(create.mock.calls[0]?.[0]?.data.permiteCruzada).toBeNull();
  });

  it('6. noturno — carga horária calculada cruzando meia-noite (19:00-07:00 = 12h)', async () => {
    const { criarPlantao } = await import('./criar');
    const { tx, create } = criarTxFake();

    await criarPlantao(tx, { ...inputBase, tipo: 'NOTURNO' }, CTX);

    expect(create.mock.calls[0]?.[0]?.data.cargaHoras).toBe(12);
  });

  it('ciclo inexistente — 404, nunca 403 (contrato-comum)', async () => {
    const { criarPlantao } = await import('./criar');
    const { tx } = criarTxFake({ ciclo: null });

    await expect(criarPlantao(tx, inputBase, CTX)).rejects.toMatchObject({ status: 404 });
  });

  it('erro de conflito que não é violação de unicidade não é mascarado', async () => {
    const { criarPlantao } = await import('./criar');
    const outroErro = new Error('falha genérica');
    const { tx } = criarTxFake({ erroCreate: outroErro });

    await expect(criarPlantao(tx, inputBase, CTX)).rejects.toBe(outroErro);
  });
});
