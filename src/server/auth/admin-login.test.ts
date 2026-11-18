/**
 * API-AUTH-006 — Testes de aceitação de `processarAdminLogin` (e-mail + senha).
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

function criarAuthFake(opts: { entrarOk: boolean }): ClienteAuthAdmin {
  return {
    async entrar(email) {
      if (!opts.entrarOk) return { ok: false };
      return { ok: true, userId: 'admin-1', email, nome: 'Fulana Admin' };
    },
  };
}

const PARAMS = { email: 'admin@exemplo.com', senha: 'senha-correta' };
const novoEstado = (): EstadoFake => ({ auditorias: [] });

describe('processarAdminLogin', () => {
  it('1. senha certa → devolve o admin e audita LOGIN_ADMIN_SUCESSO', async () => {
    const estado = novoEstado();
    const resultado = await processarAdminLogin(criarAuthFake({ entrarOk: true }), criarRepoFake(estado), PARAMS);

    expect(resultado).toEqual({ admin: { id: 'admin-1', email: 'admin@exemplo.com', nome: 'Fulana Admin' } });
    expect(estado.auditorias).toEqual([{ sucesso: true, email: 'admin@exemplo.com', adminId: 'admin-1' }]);
  });

  it('2. senha errada → 401 CREDENCIAIS_INVALIDAS e audita LOGIN_ADMIN_FALHA', async () => {
    const estado = novoEstado();
    await expect(processarAdminLogin(criarAuthFake({ entrarOk: false }), criarRepoFake(estado), PARAMS)).rejects.toMatchObject({
      status: 401,
      codigo: 'CREDENCIAIS_INVALIDAS',
    });
    expect(estado.auditorias).toEqual([{ sucesso: false, email: 'admin@exemplo.com', adminId: null }]);
  });
});
