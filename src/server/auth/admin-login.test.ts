/**
 * API-AUTH-006 — Testes de aceitação de `processarAdminLogin` (etapa de senha
 * + envio do código por WhatsApp).
 */
import { describe, expect, it } from 'vitest';
import { processarAdminLogin, type ClienteAuthAdmin, type RepositorioAdminLogin } from './admin-login';

interface EstadoFake {
  auditorias: Array<{ sucesso: boolean; email: string; adminId: string | null }>;
  envios: Array<{ userId: string; sessionId: string; whatsapp: string }>;
}

function criarRepoFake(estado: EstadoFake): RepositorioAdminLogin {
  return {
    async auditar(evento) {
      estado.auditorias.push(evento);
    },
    async enviarCodigo(params) {
      estado.envios.push(params);
    },
  };
}

function criarAuthFake(opts: { entrarOk: boolean; whatsapp?: string | null }): ClienteAuthAdmin {
  return {
    async entrar(email) {
      if (!opts.entrarOk) return { ok: false };
      return { ok: true, userId: 'admin-1', email, nome: 'Fulana Admin', whatsapp: opts.whatsapp ?? null, sessionId: 'sessao-1' };
    },
  };
}

const PARAMS = { email: 'admin@exemplo.com', senha: 'senha-correta' };
const novoEstado = (): EstadoFake => ({ auditorias: [], envios: [] });

describe('API-AUTH-006 processarAdminLogin', () => {
  it('1. senha certa + WhatsApp cadastrado → envia código e pede a etapa 2', async () => {
    const estado = novoEstado();
    const resultado = await processarAdminLogin(criarAuthFake({ entrarOk: true, whatsapp: '5511987654321' }), criarRepoFake(estado), PARAMS);

    expect(resultado).toEqual({ precisaCodigo: true, destino: '•••• 4321' });
    expect(estado.envios).toEqual([{ userId: 'admin-1', sessionId: 'sessao-1', whatsapp: '5511987654321' }]);
    // Sucesso só é auditado quando o código é confirmado.
    expect(estado.auditorias).toEqual([]);
  });

  it('2. sem WhatsApp cadastrado → WHATSAPP_NAO_CADASTRADO, nada enviado', async () => {
    const estado = novoEstado();
    await expect(processarAdminLogin(criarAuthFake({ entrarOk: true, whatsapp: null }), criarRepoFake(estado), PARAMS)).rejects.toMatchObject({
      status: 403,
      codigo: 'WHATSAPP_NAO_CADASTRADO',
    });
    expect(estado.envios).toEqual([]);
    expect(estado.auditorias).toEqual([]);
  });

  it('3. senha errada → CREDENCIAIS_INVALIDAS + LOGIN_ADMIN_FALHA, nada enviado', async () => {
    const estado = novoEstado();
    await expect(processarAdminLogin(criarAuthFake({ entrarOk: false }), criarRepoFake(estado), PARAMS)).rejects.toMatchObject({
      status: 401,
      codigo: 'CREDENCIAIS_INVALIDAS',
    });
    expect(estado.auditorias).toEqual([{ sucesso: false, email: PARAMS.email, adminId: null }]);
    expect(estado.envios).toEqual([]);
  });
});
