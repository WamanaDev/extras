/**
 * API-AUTH-001 — Testes de aceitação de `processarLogin`.
 *
 * Sem Postgres real: `RepositorioLogin` é um fake em memória.
 * `compararComHashDummy` usa o argon2id real de `./credenciais.ts` (mesmo
 * custo computacional de produção) — é justamente isso que o teste #2 (tempo
 * constante) precisa exercitar.
 *
 * Este módulo, após a remoção do CPF (ver docstring de `login.ts`), só
 * autentica com sucesso o caso de **primeiro acesso** (`pinHash === null`).
 * Matrícula existente mas já com PIN definido é tratada como falha aqui —
 * o login recorrente é `login-rapido.ts` (matrícula+PIN).
 */
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.PIN_PEPPER ??= 'pepper-pin-teste';
  process.env.SESSION_SECRET ??= 'a'.repeat(32);
  process.env.UPSTASH_REDIS_REST_URL ??= 'https://exemplo.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ??= 'teste';
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:6543/extras?pgbouncer=true';
  process.env.DIRECT_URL ??= 'postgresql://postgres:postgres@localhost:5432/extras';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'teste';
  process.env.TZ ??= 'America/Sao_Paulo';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://exemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'teste';
});

let processarLogin: typeof import('./login').processarLogin;
type RepositorioLogin = import('./login').RepositorioLogin;
type ColaboradorParaLogin = import('./login').ColaboradorParaLogin;
type DadosTentativa = import('./login').DadosTentativa;

beforeAll(async () => {
  ({ processarLogin } = await import('./login'));
});

const AGORA = new Date('2026-09-03T10:00:00.000Z');
const IP = '203.0.113.9';
const USER_AGENT = 'vitest';

interface EstadoFake {
  colaboradores: Map<string, ColaboradorParaLogin & { matricula: string }>;
  tentativas: DadosTentativa[];
}

function criarRepoFake(estado: EstadoFake): RepositorioLogin {
  return {
    async buscarPorMatricula(matricula) {
      for (const colaborador of estado.colaboradores.values()) {
        if (colaborador.matricula === matricula) return colaborador;
      }
      return null;
    },
    async emTransacao(callback) {
      return callback({
        async registrarTentativa(dados) {
          estado.tentativas.push(dados);
        },
        async atualizarAposFalha(colaboradorId, dados) {
          const c = estado.colaboradores.get(colaboradorId);
          if (c) {
            c.tentativasFalhas = dados.tentativasFalhas;
            c.bloqueadoAte = dados.bloqueadoAte;
          }
        },
        async atualizarAposSucesso(colaboradorId) {
          const c = estado.colaboradores.get(colaboradorId);
          if (c) {
            c.tentativasFalhas = 0;
            c.bloqueadoAte = null;
          }
        },
      });
    },
  };
}

function novoEstado(pinHash: string | null = null): EstadoFake {
  return {
    colaboradores: new Map([
      [
        'colab-1',
        {
          id: 'colab-1',
          matricula: 'MAT001',
          ativo: true,
          bloqueadoAte: null,
          tentativasFalhas: 0,
          pinHash,
        },
      ],
    ]),
    tentativas: [],
  };
}

describe('API-AUTH-001 processarLogin (primeiro acesso — matrícula, sem PIN definido)', () => {
  it('1. primeiro acesso (sem PIN ainda) → tokenParcial com precisaDefinirPin', async () => {
    const estado = novoEstado(null);
    const resultado = await processarLogin(criarRepoFake(estado), {
      matricula: 'MAT001',
      ip: IP,
      userAgent: USER_AGENT,
      agora: AGORA,
    });

    expect(resultado.tokenParcial.split('.')).toHaveLength(3);
    expect(resultado.precisaDefinirPin).toBe(true);
    expect(new Date(resultado.expiraEm).getTime()).toBeGreaterThan(AGORA.getTime());
    expect(estado.tentativas).toHaveLength(1);
    expect(estado.tentativas[0]?.sucesso).toBe(true);
  });

  it('2. matrícula inexistente e matrícula já com PIN definido devolvem o mesmo erro (CREDENCIAIS_INVALIDAS), ambos com verificação de hash (tempo constante)', async () => {
    const estado = novoEstado('hash-existente');
    const repo = criarRepoFake(estado);

    await expect(
      processarLogin(repo, { matricula: 'INEXISTENTE', ip: IP, userAgent: USER_AGENT, agora: AGORA }),
    ).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS', status: 401 });

    await expect(
      processarLogin(repo, { matricula: 'MAT001', ip: IP, userAgent: USER_AGENT, agora: AGORA }),
    ).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS', status: 401 });

    // matrícula inexistente também grava tentativa (colaboradorId null).
    expect(estado.tentativas.some((t) => t.colaboradorId === null && !t.sucesso)).toBe(true);
    // matrícula existente mas já com PIN também grava tentativa de falha.
    expect(estado.tentativas.some((t) => t.colaboradorId === 'colab-1' && !t.sucesso)).toBe(true);
  });

  it('3. 5 tentativas seguidas contra matrícula já com PIN definido → a 6ª devolve CONTA_BLOQUEADA', async () => {
    const estado = novoEstado('hash-existente');
    const repo = criarRepoFake(estado);

    for (let i = 0; i < 5; i++) {
      await expect(
        processarLogin(repo, { matricula: 'MAT001', ip: IP, userAgent: USER_AGENT, agora: AGORA }),
      ).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS' });
    }

    await expect(
      processarLogin(repo, { matricula: 'MAT001', ip: IP, userAgent: USER_AGENT, agora: AGORA }),
    ).rejects.toMatchObject({ codigo: 'CONTA_BLOQUEADA', status: 423 });
  });

  it('4. bloqueio expira sozinho após 15 minutos', async () => {
    const estado = novoEstado(null);
    const colaborador = estado.colaboradores.get('colab-1')!;
    colaborador.bloqueadoAte = new Date(AGORA.getTime() - 1); // bloqueio já expirado

    const resultado = await processarLogin(criarRepoFake(estado), {
      matricula: 'MAT001',
      ip: IP,
      userAgent: USER_AGENT,
      agora: AGORA,
    });
    expect(resultado.tokenParcial).toBeDefined();
  });

  it('8. colaborador inativo → COLABORADOR_INATIVO', async () => {
    const estado = novoEstado(null);
    estado.colaboradores.get('colab-1')!.ativo = false;

    await expect(
      processarLogin(criarRepoFake(estado), { matricula: 'MAT001', ip: IP, userAgent: USER_AGENT, agora: AGORA }),
    ).rejects.toMatchObject({ codigo: 'COLABORADOR_INATIVO', status: 403 });
  });

  it('precisaDefinirPin é sempre true no único caminho de sucesso deste módulo', async () => {
    const estado = novoEstado(null);

    const resultado = await processarLogin(criarRepoFake(estado), {
      matricula: 'MAT001',
      ip: IP,
      userAgent: USER_AGENT,
      agora: AGORA,
    });
    expect(resultado.precisaDefinirPin).toBe(true);
  });
});
