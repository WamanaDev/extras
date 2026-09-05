/**
 * Login rápido (matrícula+PIN) — Testes de aceitação de `processarLoginRapido`.
 * Endpoint adicional (`_conflitos.md`, item 33), não `API-AUTH-001`/`002`.
 */
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.PIN_PEPPER ??= 'pepper-pin-teste';
  process.env.SESSION_SECRET ??= 'a'.repeat(32);
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
let processarLoginRapido: typeof import('./login-rapido').processarLoginRapido;
type RepositorioLoginRapido = import('./login-rapido').RepositorioLoginRapido;
type ColaboradorParaLoginRapido = import('./login-rapido').ColaboradorParaLoginRapido;

beforeAll(async () => {
  ({ hashPin } = await import('./credenciais'));
  ({ processarLoginRapido } = await import('./login-rapido'));
});

const AGORA = new Date('2026-09-03T10:00:00.000Z');

interface EstadoFake {
  colaborador: ColaboradorParaLoginRapido | null;
  tentativas: Array<{ sucesso: boolean; motivo: string | null }>;
  tentativasSemColaborador: string[];
  sessaoCriada: boolean;
}

function criarRepoFake(estado: EstadoFake): RepositorioLoginRapido {
  return {
    async buscarPorMatricula(matricula) {
      return estado.colaborador && estado.colaborador.matricula === matricula ? estado.colaborador : null;
    },
    async registrarTentativaSemColaborador(matricula) {
      estado.tentativasSemColaborador.push(matricula);
    },
    async emTransacao(_id, callback) {
      return callback({
        async registrarTentativaEAuditoria(sucesso, motivo) {
          estado.tentativas.push({ sucesso, motivo });
        },
        async atualizarAposFalha(dados) {
          estado.colaborador!.tentativasFalhas = dados.tentativasFalhas;
          estado.colaborador!.bloqueadoAte = dados.bloqueadoAte;
        },
        async atualizarAposSucessoComSessao() {
          estado.colaborador!.tentativasFalhas = 0;
          estado.colaborador!.bloqueadoAte = null;
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
      tentativasSemColaborador: [],
      sessaoCriada: false,
    },
    pin,
  };
}

describe('processarLoginRapido (matrícula+PIN)', () => {
  it('matrícula + PIN corretos → sessão criada', async () => {
    const { estado, pin } = await novoEstado();
    const resultado = await processarLoginRapido(criarRepoFake(estado), { matricula: 'MAT001', pin, agora: AGORA });

    expect(resultado.token).toBe('token-de-sessao-fake');
    expect(resultado.colaborador.matricula).toBe('MAT001');
    expect(estado.sessaoCriada).toBe(true);
    expect(estado.tentativas).toEqual([{ sucesso: true, motivo: null }]);
  });

  it('matrícula inexistente → CREDENCIAIS_INVALIDAS, tempo constante (hash dummy)', async () => {
    const { estado } = await novoEstado();
    estado.colaborador = null;
    await expect(
      processarLoginRapido(criarRepoFake(estado), { matricula: 'NAO_EXISTE', pin: '000000', agora: AGORA }),
    ).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS', status: 401 });
    expect(estado.tentativasSemColaborador).toEqual(['NAO_EXISTE']);
  });

  it('colaborador existe mas PIN ainda não definido → mesmo erro genérico da matrícula inexistente (nenhum oráculo)', async () => {
    const { estado } = await novoEstado();
    estado.colaborador!.pinHash = null;
    await expect(
      processarLoginRapido(criarRepoFake(estado), { matricula: 'MAT001', pin: '705318', agora: AGORA }),
    ).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS', status: 401 });
    expect(estado.tentativasSemColaborador).toEqual(['MAT001']);
  });

  it('PIN errado → 401, tentativasFalhas +1', async () => {
    const { estado } = await novoEstado();
    await expect(
      processarLoginRapido(criarRepoFake(estado), { matricula: 'MAT001', pin: '000000', agora: AGORA }),
    ).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS', status: 401 });
    expect(estado.colaborador!.tentativasFalhas).toBe(1);
    expect(estado.sessaoCriada).toBe(false);
  });

  it('5 PINs errados → conta bloqueada na tentativa seguinte', async () => {
    const { estado } = await novoEstado();
    const repo = criarRepoFake(estado);
    for (let i = 0; i < 5; i++) {
      await expect(
        processarLoginRapido(repo, { matricula: 'MAT001', pin: '000000', agora: AGORA }),
      ).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS' });
    }
    await expect(
      processarLoginRapido(repo, { matricula: 'MAT001', pin: '705318', agora: AGORA }),
    ).rejects.toMatchObject({ codigo: 'CONTA_BLOQUEADA', status: 423 });
  });

  it('colaborador inativo → COLABORADOR_INATIVO', async () => {
    const { estado, pin } = await novoEstado();
    estado.colaborador!.ativo = false;
    await expect(
      processarLoginRapido(criarRepoFake(estado), { matricula: 'MAT001', pin, agora: AGORA }),
    ).rejects.toMatchObject({ codigo: 'COLABORADOR_INATIVO' });
  });
});
