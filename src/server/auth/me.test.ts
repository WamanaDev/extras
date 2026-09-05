/**
 * API-AUTH-005 — Testes de aceitação de `processarMe`.
 *
 * Os casos "sem sessão" / "sessão expirada" / "sessão revogada" (testes #2–4
 * da spec) são responsabilidade do pipeline (`defineHandler`/`resolverSessaoPadrao`,
 * já cobertos por `src/server/http/handler.test.ts`) — `processarMe` só roda
 * depois que uma sessão válida já foi resolvida. Aqui: formatação da
 * resposta por tipo de ator, renovação deslizante (#5, delegada e já testada
 * em `sessao.test.ts` — aqui só a orquestração: chama `renovarSessao` quando
 * e só quando `calcularRenovacaoSessao` manda) e ausência de CPF no payload (#6).
 *
 * `./me` importa `./sessao` → `./credenciais` → `@/env` (validação eager,
 * schema completo) — import adiado para `beforeAll`, mesmo padrão de
 * `validar-pin.test.ts`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { AtorAdmin, AtorColaborador } from '@/server/http/handler';

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

let DURACAO_SESSAO_MS: typeof import('./sessao').DURACAO_SESSAO_MS;
let processarMe: typeof import('./me').processarMe;
type ColaboradorParaMe = import('./me').ColaboradorParaMe;
type RepositorioMe = import('./me').RepositorioMe;
type SessaoParaMe = import('./me').SessaoParaMe;

beforeAll(async () => {
  ({ DURACAO_SESSAO_MS } = await import('./sessao'));
  ({ processarMe } = await import('./me'));
});

const COLABORADOR: AtorColaborador = { tipo: 'COLABORADOR', colaboradorId: 'colab-1', sessaoId: 'sessao-1' };
const ADMIN: AtorAdmin = { tipo: 'ADMIN', adminId: 'admin-1', email: 'admin@exemplo.com', nome: 'Fulana Admin' };

function criarRepoFake(
  colaborador: ColaboradorParaMe | null,
  sessao: SessaoParaMe | null,
): { repo: RepositorioMe; renovacoes: Array<{ sessaoId: string; novaExpiraEm: Date }> } {
  const renovacoes: Array<{ sessaoId: string; novaExpiraEm: Date }> = [];
  const repo: RepositorioMe = {
    async buscarColaborador(id) {
      return colaborador && colaborador.id === id ? colaborador : null;
    },
    async buscarSessao(id) {
      return sessao && id === 'sessao-1' ? sessao : null;
    },
    async renovarSessao(sessaoId, novaExpiraEm) {
      renovacoes.push({ sessaoId, novaExpiraEm });
    },
  };
  return { repo, renovacoes };
}

describe('API-AUTH-005 processarMe', () => {
  it('1. sessão de colaborador válida → 200 com ator, sem CPF no payload', async () => {
    const criadoEm = new Date('2026-09-03T00:00:00.000Z');
    const expiraEm = new Date(criadoEm.getTime() + DURACAO_SESSAO_MS); // resta 8h, não renova
    const agora = new Date('2026-09-03T01:00:00.000Z');
    const { repo, renovacoes } = criarRepoFake(
      { id: 'colab-1', nome: 'Fulano', matricula: 'MAT001', rtCodigo: 'RT1', rtNome: 'RT1' },
      { criadoEm, expiraEm },
    );

    const resultado = await processarMe(repo, COLABORADOR, agora);

    expect(resultado).toEqual({
      tipo: 'COLABORADOR',
      colaborador: { id: 'colab-1', nome: 'Fulano', matricula: 'MAT001', rt: { codigo: 'RT1', nome: 'RT1' } },
      expiraEm: expiraEm.toISOString(),
    });
    expect(renovacoes).toEqual([]);
    // 6. payload nunca contém CPF/hash — estruturalmente: nenhuma chave do objeto menciona cpf.
    expect(JSON.stringify(resultado)).not.toMatch(/cpf/i);
  });

  it('1b. sessão de admin válida → 200 com ator admin', async () => {
    const { repo } = criarRepoFake(null, null);
    const resultado = await processarMe(repo, ADMIN, new Date());
    expect(resultado).toEqual({ tipo: 'ADMIN', admin: { id: 'admin-1', email: 'admin@exemplo.com', nome: 'Fulana Admin' } });
  });

  it('5. restando 1h → renova para 8h, respeitando teto de 12h, e chama renovarSessao', async () => {
    const criadoEm = new Date('2026-09-03T00:00:00.000Z');
    const expiraEm = new Date(criadoEm.getTime() + DURACAO_SESSAO_MS); // 08:00
    const agora = new Date(expiraEm.getTime() - 60 * 60 * 1000); // 07:00, resta 1h
    const { repo, renovacoes } = criarRepoFake(
      { id: 'colab-1', nome: 'Fulano', matricula: 'MAT001', rtCodigo: 'RT1', rtNome: 'RT1' },
      { criadoEm, expiraEm },
    );

    const resultado = await processarMe(repo, COLABORADOR, agora);

    expect(renovacoes).toHaveLength(1);
    expect(renovacoes[0]!.sessaoId).toBe('sessao-1');
    expect(resultado).toMatchObject({ tipo: 'COLABORADOR' });
    if (resultado.tipo === 'COLABORADOR') {
      expect(new Date(resultado.expiraEm).getTime()).toBe(renovacoes[0]!.novaExpiraEm.getTime());
      expect(new Date(resultado.expiraEm).getTime()).toBeGreaterThan(expiraEm.getTime());
    }
  });

  it('sessão sumida entre autenticação e handler (corrida rara) → NAO_AUTENTICADO', async () => {
    const { repo } = criarRepoFake({ id: 'colab-1', nome: 'Fulano', matricula: 'MAT001', rtCodigo: 'RT1', rtNome: 'RT1' }, null);
    await expect(processarMe(repo, COLABORADOR, new Date())).rejects.toMatchObject({ codigo: 'NAO_AUTENTICADO', status: 401 });
  });
});
