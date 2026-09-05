/**
 * API-AUTH-002 — Testes de aceitação de `processarPin`.
 */
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.PIN_PEPPER ??= 'pepper-pin-teste';
  process.env.SESSION_SECRET ??= 'a'.repeat(32);
  // `@/env` valida o schema completo (server + client) mesmo em teste — sem
  // isso o import dinâmico abaixo falha de forma não-determinística conforme
  // a ordem/worker em que os arquivos de teste rodam (só funcionava quando
  // outro arquivo do mesmo worker já tinha setado essas variáveis antes).
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:6543/extras?pgbouncer=true';
  process.env.DIRECT_URL ??= 'postgresql://postgres:postgres@localhost:5432/extras';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'teste';
  process.env.UPSTASH_REDIS_REST_URL ??= 'https://exemplo.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ??= 'teste';
  process.env.TZ ??= 'America/Sao_Paulo';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://exemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'teste';
});

let hashPin: typeof import('./credenciais').hashPin;
let processarPin: typeof import('./validar-pin').processarPin;
type RepositorioPin = import('./validar-pin').RepositorioPin;
type ColaboradorParaPin = import('./validar-pin').ColaboradorParaPin;

beforeAll(async () => {
  ({ hashPin } = await import('./credenciais'));
  ({ processarPin } = await import('./validar-pin'));
});

const AGORA = new Date('2026-09-03T10:00:00.000Z');

interface EstadoFake {
  colaborador: ColaboradorParaPin;
  tentativas: Array<{ sucesso: boolean }>;
  sessaoCriada: boolean;
}

function criarRepoFake(estado: EstadoFake): RepositorioPin {
  return {
    async buscarPorId(id) {
      return estado.colaborador.id === id ? estado.colaborador : null;
    },
    async emTransacao(_id, callback) {
      return callback({
        async registrarTentativaEAuditoria(sucesso) {
          estado.tentativas.push({ sucesso });
        },
        async atualizarAposFalha(dados) {
          estado.colaborador.tentativasFalhas = dados.tentativasFalhas;
          estado.colaborador.bloqueadoAte = dados.bloqueadoAte;
        },
        async atualizarAposSucessoComSessao() {
          estado.colaborador.tentativasFalhas = 0;
          estado.colaborador.bloqueadoAte = null;
          estado.sessaoCriada = true;
          return { token: 'token-de-sessao-fake', expiraEm: new Date(AGORA.getTime() + 8 * 60 * 60 * 1000) };
        },
      });
    },
  };
}

async function novoEstado(pin = '705318'): Promise<{ estado: EstadoFake; pin: string }> {
  const pinHash = await hashPin(pin);
  return {
    estado: {
      colaborador: {
        id: 'colab-1',
        nome: 'Fulano',
        matricula: 'MAT001',
        pinHash,
        ativo: true,
        bloqueadoAte: null,
        tentativasFalhas: 0,
        rtCodigo: 'RT1',
        rtNome: 'RT1',
      },
      tentativas: [],
      sessaoCriada: false,
    },
    pin,
  };
}

describe('API-AUTH-002 processarPin', () => {
  it('1. PIN correto → sessão criada', async () => {
    const { estado, pin } = await novoEstado();
    const resultado = await processarPin(criarRepoFake(estado), { colaboradorId: 'colab-1', pin, agora: AGORA });

    expect(resultado.token).toBe('token-de-sessao-fake');
    expect(resultado.colaborador.matricula).toBe('MAT001');
    expect(estado.sessaoCriada).toBe(true);
    expect(estado.tentativas).toEqual([{ sucesso: true }]);
  });

  it('2. PIN errado → 401, tentativasFalhas +1', async () => {
    const { estado } = await novoEstado();
    await expect(
      processarPin(criarRepoFake(estado), { colaboradorId: 'colab-1', pin: '000000', agora: AGORA }),
    ).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS', status: 401 });
    expect(estado.colaborador.tentativasFalhas).toBe(1);
    expect(estado.sessaoCriada).toBe(false);
  });

  it('4. PIN não definido → PIN_NAO_DEFINIDO', async () => {
    const { estado } = await novoEstado();
    estado.colaborador.pinHash = null;
    await expect(
      processarPin(criarRepoFake(estado), { colaboradorId: 'colab-1', pin: '705318', agora: AGORA }),
    ).rejects.toMatchObject({ codigo: 'PIN_NAO_DEFINIDO', status: 409 });
  });

  it('7. 5 PINs errados → conta bloqueada na tentativa seguinte', async () => {
    const { estado } = await novoEstado();
    const repo = criarRepoFake(estado);
    for (let i = 0; i < 5; i++) {
      await expect(
        processarPin(repo, { colaboradorId: 'colab-1', pin: '000000', agora: AGORA }),
      ).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS' });
    }
    await expect(
      processarPin(repo, { colaboradorId: 'colab-1', pin: '705318', agora: AGORA }),
    ).rejects.toMatchObject({ codigo: 'CONTA_BLOQUEADA', status: 423 });
  });

  it('colaborador inexistente (sumiu entre etapa 1 e 2) → CREDENCIAIS_INVALIDAS, nunca vaza detalhe', async () => {
    const { estado } = await novoEstado();
    await expect(
      processarPin(criarRepoFake(estado), { colaboradorId: 'outro-id', pin: '705318', agora: AGORA }),
    ).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS' });
  });
});
