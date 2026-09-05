/**
 * API-AUTH-006 — Testes de aceitação de `processarAdminLogin`.
 */
import { describe, expect, it } from 'vitest';
import { processarAdminLogin, type ClienteAuthAdmin, type RepositorioAdminLogin } from './admin-login';

interface EstadoFake {
  auditorias: Array<{ sucesso: boolean; email: string; adminId: string | null }>;
}

function criarRepoFake(estado: EstadoFake): RepositorioAdminLogin {
  return {
    async auditar(evento) {
      estado.auditorias.push(evento);
    },
  };
}

function criarAuthFake(opts: {
  entrarOk: boolean;
  fatores?: Array<{ id: string; status: 'verified' | 'unverified' }>;
  nivel?: { atual: string; proximo: string };
}): ClienteAuthAdmin {
  return {
    async entrar(email) {
      if (!opts.entrarOk) return { ok: false };
      return { ok: true, userId: 'admin-1', email, nome: 'Fulana Admin' };
    },
    async listarFatoresMfa() {
      return opts.fatores ?? [];
    },
    async nivelAsseguranca() {
      return opts.nivel ?? { atual: 'aal1', proximo: 'aal1' };
    },
    async desafiarFator() {
      return 'desafio-123';
    },
  };
}

const PARAMS = { email: 'admin@exemplo.com', senha: 'senha-correta' };

describe('API-AUTH-006 processarAdminLogin', () => {
  it('1. credenciais + MFA já completo (aal2) → sessão criada', async () => {
    const estado: EstadoFake = { auditorias: [] };
    const auth = criarAuthFake({
      entrarOk: true,
      fatores: [{ id: 'fator-1', status: 'verified' }],
      nivel: { atual: 'aal2', proximo: 'aal2' },
    });

    const resultado = await processarAdminLogin(auth, criarRepoFake(estado), PARAMS);

    expect(resultado).toEqual({ admin: { id: 'admin-1', email: 'admin@exemplo.com', nome: 'Fulana Admin' } });
    expect(estado.auditorias).toEqual([{ sucesso: true, email: PARAMS.email, adminId: 'admin-1' }]);
  });

  it('credenciais + MFA pendente (aal1 → aal2) → precisaMfa com desafioId', async () => {
    const estado: EstadoFake = { auditorias: [] };
    const auth = criarAuthFake({
      entrarOk: true,
      fatores: [{ id: 'fator-1', status: 'verified' }],
      nivel: { atual: 'aal1', proximo: 'aal2' },
    });

    const resultado = await processarAdminLogin(auth, criarRepoFake(estado), PARAMS);

    expect(resultado).toEqual({ precisaMfa: true, desafioId: 'desafio-123' });
    // Ainda não é sucesso de login (falta o desafio) — não audita sucesso ainda.
    expect(estado.auditorias).toEqual([]);
  });

  it('2. sem MFA cadastrado → MFA_OBRIGATORIO', async () => {
    const estado: EstadoFake = { auditorias: [] };
    const auth = criarAuthFake({ entrarOk: true, fatores: [] });

    await expect(processarAdminLogin(auth, criarRepoFake(estado), PARAMS)).rejects.toMatchObject({
      codigo: 'MFA_OBRIGATORIO',
      status: 403,
    });
  });

  it('3. senha errada → 401 genérico, audita falha', async () => {
    const estado: EstadoFake = { auditorias: [] };
    const auth = criarAuthFake({ entrarOk: false });

    await expect(processarAdminLogin(auth, criarRepoFake(estado), PARAMS)).rejects.toMatchObject({
      codigo: 'CREDENCIAIS_INVALIDAS',
      status: 401,
    });
    expect(estado.auditorias).toEqual([{ sucesso: false, email: PARAMS.email, adminId: null }]);
  });

  it('só fatores não verificados conta como sem MFA', async () => {
    const estado: EstadoFake = { auditorias: [] };
    const auth = criarAuthFake({ entrarOk: true, fatores: [{ id: 'fator-1', status: 'unverified' }] });

    await expect(processarAdminLogin(auth, criarRepoFake(estado), PARAMS)).rejects.toMatchObject({ codigo: 'MFA_OBRIGATORIO' });
  });
});
