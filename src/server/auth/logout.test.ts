/**
 * API-AUTH-004 — Testes de aceitação de `processarLogout`.
 */
import { describe, expect, it } from 'vitest';
import { processarLogout, type RepositorioLogout, type TransacaoLogout } from './logout';

const AGORA = new Date('2026-09-03T10:00:00.000Z');

interface EstadoFake {
  sessoes: Record<string, { colaboradorId: string; revogadaEm: Date | null }>;
  auditorias: string[];
}

function criarRepoFake(estado: EstadoFake): RepositorioLogout {
  return {
    async emTransacao(callback) {
      const tx: TransacaoLogout = {
        async revogarSessao(tokenHash, agora) {
          const sessao = estado.sessoes[tokenHash];
          if (!sessao || sessao.revogadaEm !== null) return null;
          sessao.revogadaEm = agora;
          return sessao.colaboradorId;
        },
        async auditarLogout(colaboradorId) {
          estado.auditorias.push(colaboradorId);
        },
      };
      return callback(tx);
    },
  };
}

function novoEstado(): EstadoFake {
  return {
    sessoes: { 'hash-valido': { colaboradorId: 'colab-1', revogadaEm: null } },
    auditorias: [],
  };
}

describe('API-AUTH-004 processarLogout', () => {
  it('1. logout com sessão → revogadaEm preenchido e LOGOUT auditado', async () => {
    const estado = novoEstado();
    await processarLogout(criarRepoFake(estado), { tokenHash: 'hash-valido', agora: AGORA });

    expect(estado.sessoes['hash-valido']!.revogadaEm).toEqual(AGORA);
    expect(estado.auditorias).toEqual(['colab-1']);
  });

  it('2. token já revogado (request seguinte) → não revoga de novo nem audita', async () => {
    const estado = novoEstado();
    estado.sessoes['hash-valido']!.revogadaEm = new Date('2026-09-03T09:00:00.000Z');

    await processarLogout(criarRepoFake(estado), { tokenHash: 'hash-valido', agora: AGORA });

    expect(estado.sessoes['hash-valido']!.revogadaEm).toEqual(new Date('2026-09-03T09:00:00.000Z'));
    expect(estado.auditorias).toEqual([]);
  });

  it('3. logout sem sessão (tokenHash null) → não lança, idempotente', async () => {
    const estado = novoEstado();
    await expect(processarLogout(criarRepoFake(estado), { tokenHash: null, agora: AGORA })).resolves.toBeUndefined();
    expect(estado.auditorias).toEqual([]);
  });

  it('4. logout 2× seguidas → segunda chamada não audita de novo', async () => {
    const estado = novoEstado();
    const repo = criarRepoFake(estado);

    await processarLogout(repo, { tokenHash: 'hash-valido', agora: AGORA });
    await processarLogout(repo, { tokenHash: 'hash-valido', agora: AGORA });

    expect(estado.auditorias).toEqual(['colab-1']);
  });

  it('token de sessão inexistente (cookie forjado) → não lança', async () => {
    const estado = novoEstado();
    await expect(processarLogout(criarRepoFake(estado), { tokenHash: 'hash-desconhecido', agora: AGORA })).resolves.toBeUndefined();
    expect(estado.auditorias).toEqual([]);
  });
});
