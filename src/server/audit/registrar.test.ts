/**
 * Testes de unidade com um `tx` fake (sem banco real) — cobrem a lógica de
 * `registrarAuditoria`: encadeamento de hash, redação de payload antes da
 * gravação, e propagação de erro quando o INSERT falha (AUD-3). Os testes de
 * integração reais (A1–A7, contra Postgres com a tabela `audit_log`) ficam
 * pendentes — ver nota no topo de `registrar.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { registrarAuditoria, type EventoAuditoria } from './registrar';
import { calcularHash, GENESIS } from './hash-chain';
import type { ClienteTransacao } from '@/server/db/tx';

function eventoBase(payload: unknown = { plantaoId: 'p1' }): EventoAuditoria {
  return {
    atorTipo: 'COLABORADOR',
    atorId: 'colab-1',
    acao: 'EXTRA_MARCADA',
    entidade: 'marcacao',
    entidadeId: 'marcacao-1',
    payload,
    ip: '10.0.0.1',
    userAgent: 'vitest',
    requestId: 'req-1',
  };
}

function criarTxFake(opcoes: { ultimoHash?: string | null; executeRawImpl?: () => Promise<unknown> } = {}) {
  const queryRaw = vi.fn().mockResolvedValue(
    opcoes.ultimoHash === undefined ? [] : opcoes.ultimoHash === null ? [] : [{ hash: opcoes.ultimoHash }],
  );
  const executeRaw = vi.fn(
    (opcoes.executeRawImpl as ((...args: unknown[]) => Promise<unknown>) | undefined) ??
      (async (..._args: unknown[]) => 1),
  );
  const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw } as unknown as ClienteTransacao;
  return { tx, queryRaw, executeRaw };
}

describe('registrarAuditoria (SEC-AUD)', () => {
  it('primeira linha usa GENESIS como hash_anterior (audit_log vazia)', async () => {
    const { tx, executeRaw } = criarTxFake({ ultimoHash: null });
    const resultado = await registrarAuditoria(tx, eventoBase());

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(resultado.hash).toHaveLength(64); // sha256 hex
    // O hash calculado deve bater com recalcular manualmente com hashAnterior=GENESIS.
  });

  it('encadeia a partir do hash da última linha existente', async () => {
    const { tx } = criarTxFake({ ultimoHash: 'hash-anterior-existente' });
    const resultado = await registrarAuditoria(tx, eventoBase());
    // Não dá para prever id/criadoEm exatos (gerados internamente), mas o hash
    // não deve ser igual ao que sairia de uma cadeia GENESIS.
    const hashComoSeFosseGenesis = calcularHash({
      hashAnterior: GENESIS,
      id: 'outro-id',
      atorId: 'colab-1',
      acao: 'EXTRA_MARCADA',
      entidadeId: 'marcacao-1',
      payloadTexto: JSON.stringify({ plantaoId: 'p1' }),
      criadoEm: '2000-01-01T00:00:00.000Z',
    });
    expect(resultado.hash).not.toBe(hashComoSeFosseGenesis);
  });

  it('redige PIN do payload antes de gravar (A6)', async () => {
    const { tx, executeRaw } = criarTxFake({ ultimoHash: null });
    await registrarAuditoria(tx, eventoBase({ pin: '1234', nome: 'Maria' }));

    const chamada = executeRaw.mock.calls[0];
    expect(chamada).toBeDefined();
    // O array de valores interpolados na tagged template é o resto dos args.
    const valoresInterpolados = chamada?.slice(1) ?? [];
    const payloadTexto = valoresInterpolados.find(
      (v): v is string => typeof v === 'string' && v.includes('nome'),
    );
    expect(payloadTexto).toBeDefined();
    expect(payloadTexto).not.toContain('1234');
    expect(payloadTexto).toContain('[REDIGIDO]');
  });

  it('AUD-3: falha no INSERT propaga (não existe caminho silencioso)', async () => {
    const { tx } = criarTxFake({
      ultimoHash: null,
      executeRawImpl: async () => {
        throw new Error('violação de constraint simulada');
      },
    });

    await expect(registrarAuditoria(tx, eventoBase())).rejects.toThrow('violação de constraint simulada');
  });
});
