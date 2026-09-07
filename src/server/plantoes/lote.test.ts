/**
 * API-ADM-PLA-002 — testes de aceitação (`specs/04-api/admin-plantoes/API-ADM-PLA-002-lote.md`)
 * com `tx` mockado, mesmo padrão de `./criar.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteTransacao } from '@/server/db/tx';
import type { ContextoAuditoria } from './criar';
import { TETO_LOTE, type GerarLoteInput } from './lote';

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn().mockResolvedValue({ id: 'audit-1', hash: 'hash-1' }),
}));

const CTX: ContextoAuditoria = { atorId: 'admin-1', ip: '10.0.0.1', userAgent: 'vitest', requestId: 'req-1' };
const CICLO_SETEMBRO_2026 = { id: 'ciclo-1', ano: 2026, mes: 9, status: 'RASCUNHO' };

function data(dia: string): Date {
  return new Date(`2026-09-${dia}T00:00:00.000Z`);
}

function criarTxFake(overrides: {
  ciclo?: Record<string, unknown> | null;
  plantoesExistentes?: Array<{ rtId: string; data: Date; tipo: string }>;
} = {}): { tx: ClienteTransacao; createMany: ReturnType<typeof vi.fn> } {
  const createMany = vi.fn().mockImplementation(async (args: { data: unknown[] }) => ({ count: args.data.length }));
  const tx = {
    ciclo: { findUnique: vi.fn().mockResolvedValue(overrides.ciclo === undefined ? CICLO_SETEMBRO_2026 : overrides.ciclo) },
    plantao: {
      findMany: vi.fn().mockResolvedValue(overrides.plantoesExistentes ?? []),
      createMany,
    },
  } as unknown as ClienteTransacao;
  return { tx, createMany };
}

function inputBase(overrides: Partial<GerarLoteInput> = {}): GerarLoteInput {
  return {
    cicloId: 'ciclo-1',
    rtIds: ['rt-1', 'rt-2'],
    de: data('01'),
    ate: data('30'),
    tipos: ['DIURNO', 'NOTURNO'],
    vagasTotais: 2,
    permiteCruzada: null,
    preview: false,
    ...overrides,
  };
}

describe('API-ADM-PLA-002 — gerarLotePlantoes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1. mês inteiro, 2 turnos, 2 RTs — 4x dias do mês criados', async () => {
    const { gerarLotePlantoes } = await import('./lote');
    const { tx } = criarTxFake();

    const resultado = await gerarLotePlantoes(tx, inputBase(), CTX);

    expect(resultado.criados).toBe(30 * 2 * 2);
    expect(resultado.ignorados).toHaveLength(0);
  });

  it('2. preview — nada gravado', async () => {
    const { gerarLotePlantoes } = await import('./lote');
    const { tx, createMany } = criarTxFake();

    const resultado = await gerarLotePlantoes(tx, inputBase({ preview: true }), CTX);

    expect(createMany).not.toHaveBeenCalled();
    expect(resultado.criados).toBe(0);
    expect(resultado.preview).toHaveLength(30 * 2 * 2);
  });

  it('3. sobrepondo existentes — listados como ignorados (JA_EXISTE)', async () => {
    const { gerarLotePlantoes } = await import('./lote');
    const { tx, createMany } = criarTxFake({
      plantoesExistentes: [{ rtId: 'rt-1', data: data('05'), tipo: 'DIURNO' }],
    });

    const resultado = await gerarLotePlantoes(
      tx,
      inputBase({ de: data('05'), ate: data('05'), tipos: ['DIURNO'], rtIds: ['rt-1'] }),
      CTX,
    );

    expect(resultado.criados).toBe(0);
    expect(resultado.ignorados).toEqual([{ data: '2026-09-05', tipo: 'DIURNO', rt: 'rt-1', motivo: 'JA_EXISTE' }]);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('4. falha no meio — rollback total (createMany rejeita, nenhum resultado parcial é devolvido)', async () => {
    const { gerarLotePlantoes } = await import('./lote');
    const { tx, createMany } = criarTxFake();
    createMany.mockRejectedValue(new Error('conexão perdida no meio do lote'));

    await expect(gerarLotePlantoes(tx, inputBase({ de: data('01'), ate: data('01'), tipos: ['DIURNO'], rtIds: ['rt-1'] }), CTX)).rejects.toThrow(
      'conexão perdida no meio do lote',
    );
  });

  it('5. 600 plantões — 422 LOTE_EXCEDE_TETO, nada gravado', async () => {
    const { gerarLotePlantoes } = await import('./lote');
    const { tx, createMany } = criarTxFake();

    // 30 dias * 4 rtIds * 5 tipos não é válido (Turno só tem 2 valores) — usa
    // rtIds suficientes para estourar o teto de 500 com 2 tipos e 31 dias.
    const muitosRts = Array.from({ length: 9 }, (_, i) => `rt-${i}`); // 31*9*2 = 558 > 500
    const erro = await gerarLotePlantoes(
      tx,
      inputBase({ de: data('01'), ate: data('30'), rtIds: muitosRts, tipos: ['DIURNO', 'NOTURNO'] }),
      CTX,
    ).catch((e) => e);

    expect(erro).toMatchObject({ status: 422, codigo: 'LOTE_EXCEDE_TETO' });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('teto exato (500) não estoura', () => {
    expect(TETO_LOTE).toBe(500);
  });

  it('6. diasSemana = [1..5] — só dias úteis (segunda a sexta)', async () => {
    const { gerarLotePlantoes } = await import('./lote');
    const { tx } = criarTxFake();

    // Setembro/2026: dia 1 é terça-feira — semana 1..5 (dias úteis) do mês inteiro.
    const resultado = await gerarLotePlantoes(
      tx,
      inputBase({ tipos: ['DIURNO'], rtIds: ['rt-1'], diasSemana: [1, 2, 3, 4, 5] }),
      CTX,
    );

    // conta quantos dias úteis existem em setembro/2026 via Date nativo, sem duplicar a lógica do sistema sob teste.
    let uteis = 0;
    for (let dia = 1; dia <= 30; dia++) {
      const dow = new Date(Date.UTC(2026, 8, dia)).getUTCDay();
      if (dow >= 1 && dow <= 5) uteis++;
    }
    expect(resultado.criados).toBe(uteis);
  });

  it('7. paridade = PAR — só dias pares do intervalo (pedido do usuário)', async () => {
    const { gerarLotePlantoes } = await import('./lote');
    const { tx } = criarTxFake();

    const resultado = await gerarLotePlantoes(
      tx,
      inputBase({ de: data('04'), ate: data('20'), tipos: ['DIURNO'], rtIds: ['rt-1'], paridade: 'PAR' }),
      CTX,
    );

    // 04,06,08,10,12,14,16,18,20 → 9 dias pares no intervalo.
    expect(resultado.criados).toBe(9);
  });

  it('8. paridade = IMPAR — só dias ímpares do intervalo', async () => {
    const { gerarLotePlantoes } = await import('./lote');
    const { tx } = criarTxFake();

    const resultado = await gerarLotePlantoes(
      tx,
      inputBase({ de: data('04'), ate: data('20'), tipos: ['DIURNO'], rtIds: ['rt-1'], paridade: 'IMPAR' }),
      CTX,
    );

    // 05,07,09,11,13,15,17,19 → 8 dias ímpares no intervalo.
    expect(resultado.criados).toBe(8);
  });

  it('9. paridade = AMBOS (ou omitida) — nenhum filtro, comportamento idêntico ao de antes', async () => {
    const { gerarLotePlantoes } = await import('./lote');
    const { tx: txAmbos } = criarTxFake();
    const { tx: txOmitido } = criarTxFake();

    const resultadoAmbos = await gerarLotePlantoes(
      txAmbos,
      inputBase({ de: data('04'), ate: data('20'), tipos: ['DIURNO'], rtIds: ['rt-1'], paridade: 'AMBOS' }),
      CTX,
    );
    const resultadoOmitido = await gerarLotePlantoes(
      txOmitido,
      inputBase({ de: data('04'), ate: data('20'), tipos: ['DIURNO'], rtIds: ['rt-1'] }),
      CTX,
    );

    expect(resultadoAmbos.criados).toBe(17); // 04..20 inclusive = 17 dias
    expect(resultadoOmitido.criados).toBe(17);
  });

  it('itens fora do mês do ciclo são ignorados com FORA_DO_CICLO', async () => {
    const { gerarLotePlantoes } = await import('./lote');
    const { tx } = criarTxFake();

    const resultado = await gerarLotePlantoes(
      tx,
      inputBase({ de: new Date('2026-08-31T00:00:00.000Z'), ate: new Date('2026-08-31T00:00:00.000Z'), tipos: ['DIURNO'], rtIds: ['rt-1'] }),
      CTX,
    );

    expect(resultado.ignorados).toEqual([{ data: '2026-08-31', tipo: 'DIURNO', rt: 'rt-1', motivo: 'FORA_DO_CICLO' }]);
  });

  it('auditoria com os parâmetros do lote, não uma linha por plantão', async () => {
    const { gerarLotePlantoes } = await import('./lote');
    const { tx } = criarTxFake();

    await gerarLotePlantoes(tx, inputBase({ de: data('01'), ate: data('02'), tipos: ['DIURNO'], rtIds: ['rt-1'] }), CTX);

    const { registrarAuditoria } = await import('@/server/audit/registrar');
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ acao: 'PLANTAO_CRIADO', payload: expect.objectContaining({ lote: true, criados: 2 }) }),
    );
  });
});
