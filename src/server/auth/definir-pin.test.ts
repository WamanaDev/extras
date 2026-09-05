/**
 * API-AUTH-003 — Testes de aceitação de `processarDefinirPin`.
 */
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.PIN_PEPPER ??= 'pepper-pin-teste';
  process.env.SESSION_SECRET ??= 'a'.repeat(32);
  // `@/env` valida o schema completo (server + client) — ver o mesmo
  // comentário em `validar-pin.test.ts`/`sessao.test.ts`.
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:6543/extras?pgbouncer=true';
  process.env.DIRECT_URL ??= 'postgresql://postgres:postgres@localhost:5432/extras';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'teste';
  process.env.UPSTASH_REDIS_REST_URL ??= 'https://exemplo.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ??= 'teste';
  process.env.TZ ??= 'America/Sao_Paulo';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://exemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'teste';
});

let processarDefinirPin: typeof import('./definir-pin').processarDefinirPin;
type RepositorioDefinirPin = import('./definir-pin').RepositorioDefinirPin;
type ColaboradorParaDefinirPin = import('./definir-pin').ColaboradorParaDefinirPin;

beforeAll(async () => {
  ({ processarDefinirPin } = await import('./definir-pin'));
});

interface EstadoFake {
  colaborador: ColaboradorParaDefinirPin;
  pinGravado: string | null;
  auditado: boolean;
  sessaoCriada: boolean;
}

function criarRepoFake(estado: EstadoFake): RepositorioDefinirPin {
  return {
    async buscarPorId(id) {
      return estado.colaborador.id === id ? estado.colaborador : null;
    },
    async emTransacao(_id, callback) {
      return callback({
        async gravarPinEcriarSessao(pinHash) {
          estado.pinGravado = pinHash;
          estado.auditado = true;
          estado.sessaoCriada = true;
          return { token: 'token-de-sessao-fake', expiraEm: new Date('2026-09-03T18:00:00.000Z') };
        },
      });
    },
  };
}

function novoEstado(overrides: Partial<ColaboradorParaDefinirPin> = {}): EstadoFake {
  return {
    colaborador: {
      id: 'colab-1',
      nome: 'Fulano',
      matricula: 'MAT001',
      ativo: true,
      pinHash: null,
      precisaTrocarPin: true,
      rtCodigo: 'RT1',
      rtNome: 'RT1',
      ...overrides,
    },
    pinGravado: null,
    auditado: false,
    sessaoCriada: false,
  };
}

const PARAMS_BASE = { colaboradorId: 'colab-1', pin: '705318', confirmacao: '705318' };

describe('API-AUTH-003 processarDefinirPin', () => {
  it('1. PIN válido → definido e sessão criada', async () => {
    const estado = novoEstado();
    const resultado = await processarDefinirPin(criarRepoFake(estado), PARAMS_BASE);

    expect(resultado.token).toBe('token-de-sessao-fake');
    expect(resultado.colaborador).toEqual({ id: 'colab-1', nome: 'Fulano', matricula: 'MAT001', rt: { codigo: 'RT1', nome: 'RT1' } });
    expect(estado.pinGravado).not.toBeNull();
    expect(estado.auditado).toBe(true);
    expect(estado.sessaoCriada).toBe(true);
  });

  it('2. PIN fraco (sequência/repetido) → PIN_FRACO', async () => {
    const estado = novoEstado();
    for (const pinFraco of ['1234', '4321', '1111']) {
      await expect(
        processarDefinirPin(criarRepoFake(novoEstado()), { ...PARAMS_BASE, pin: pinFraco, confirmacao: pinFraco }),
      ).rejects.toMatchObject({ codigo: 'PIN_FRACO', status: 422 });
    }
    expect(estado.pinGravado).toBeNull();
  });

  it('3. PIN igual à matrícula → PIN_FRACO', async () => {
    const estado = novoEstado({ matricula: '890156' });
    await expect(
      processarDefinirPin(criarRepoFake(estado), { ...PARAMS_BASE, pin: '890156', confirmacao: '890156' }),
    ).rejects.toMatchObject({ codigo: 'PIN_FRACO', status: 422 });
  });

  it('4. confirmação divergente → PIN_NAO_CONFERE', async () => {
    const estado = novoEstado();
    await expect(
      processarDefinirPin(criarRepoFake(estado), { ...PARAMS_BASE, pin: '705318', confirmacao: '000000' }),
    ).rejects.toMatchObject({ codigo: 'PIN_NAO_CONFERE', status: 422 });
    expect(estado.pinGravado).toBeNull();
  });

  it('6. PIN já definido (e não precisa trocar) → PIN_JA_DEFINIDO', async () => {
    const estado = novoEstado({ pinHash: 'hash-existente', precisaTrocarPin: false });
    await expect(processarDefinirPin(criarRepoFake(estado), PARAMS_BASE)).rejects.toMatchObject({
      codigo: 'PIN_JA_DEFINIDO',
      status: 409,
    });
    expect(estado.pinGravado).toBeNull();
  });

  it('PIN já definido mas precisaTrocarPin=true (reset admin) → permite redefinir', async () => {
    const estado = novoEstado({ pinHash: 'hash-antigo', precisaTrocarPin: true });
    const resultado = await processarDefinirPin(criarRepoFake(estado), PARAMS_BASE);
    expect(resultado.token).toBe('token-de-sessao-fake');
    expect(estado.pinGravado).not.toBeNull();
  });

  it('colaborador inexistente/inativo (token stale) → CREDENCIAIS_INVALIDAS', async () => {
    const estado = novoEstado({ ativo: false });
    await expect(processarDefinirPin(criarRepoFake(estado), PARAMS_BASE)).rejects.toMatchObject({
      codigo: 'CREDENCIAIS_INVALIDAS',
      status: 401,
    });
  });
});
