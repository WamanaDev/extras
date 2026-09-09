/**
 * Testes de `listarAdministradores`/`convidarAdministrador`/`revogarAdministrador`
 * — Supabase Admin API fake (nenhuma chamada de rede real).
 */
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listarAdministradores, convidarAdministrador, revogarAdministrador, ehEmailJaExistente } from './administradores';

function criarSupabaseFake(config: {
  usuarios?: Array<Record<string, unknown>>;
  erroListar?: string;
  erroConvidar?: string;
  convidadoId?: string;
  erroRevogar?: string;
}): SupabaseClient & { auth: { admin: { deleteUser: ReturnType<typeof vi.fn>; inviteUserByEmail: ReturnType<typeof vi.fn> } } } {
  return {
    auth: {
      admin: {
        listUsers: vi.fn(async () =>
          config.erroListar
            ? { data: { users: [] }, error: { message: config.erroListar } }
            : { data: { users: config.usuarios ?? [] }, error: null },
        ),
        inviteUserByEmail: vi.fn(async (email: string) =>
          config.erroConvidar
            ? { data: { user: null }, error: { message: config.erroConvidar } }
            : { data: { user: { id: config.convidadoId ?? 'admin-novo', email } }, error: null },
        ),
        deleteUser: vi.fn(async () => (config.erroRevogar ? { data: null, error: { message: config.erroRevogar } } : { data: {}, error: null })),
      },
    },
  } as unknown as SupabaseClient & { auth: { admin: { deleteUser: ReturnType<typeof vi.fn>; inviteUserByEmail: ReturnType<typeof vi.fn> } } };
}

describe('listarAdministradores', () => {
  it('mapeia nome de user_metadata (nome ou full_name), mfaAtivo a partir de factors, e pendente de last_sign_in_at', async () => {
    const supabase = criarSupabaseFake({
      usuarios: [
        {
          id: 'a1',
          email: 'a1@exemplo.com',
          created_at: '2026-01-01T00:00:00Z',
          last_sign_in_at: '2026-02-01T00:00:00Z',
          user_metadata: { nome: 'Fulana' },
          factors: [{ id: 'f1' }],
        },
        {
          id: 'a2',
          email: 'a2@exemplo.com',
          created_at: '2026-01-02T00:00:00Z',
          last_sign_in_at: null,
          user_metadata: { full_name: 'Beltrano' },
          factors: [],
        },
        {
          id: 'a3',
          email: 'a3@exemplo.com',
          created_at: '2026-01-03T00:00:00Z',
          last_sign_in_at: null,
          user_metadata: {},
        },
      ],
    });

    const resultado = await listarAdministradores(supabase);

    expect(resultado).toEqual([
      { id: 'a1', email: 'a1@exemplo.com', nome: 'Fulana', criadoEm: '2026-01-01T00:00:00Z', ultimoLoginEm: '2026-02-01T00:00:00Z', mfaAtivo: true, pendente: false },
      { id: 'a2', email: 'a2@exemplo.com', nome: 'Beltrano', criadoEm: '2026-01-02T00:00:00Z', ultimoLoginEm: null, mfaAtivo: false, pendente: true },
      { id: 'a3', email: 'a3@exemplo.com', nome: null, criadoEm: '2026-01-03T00:00:00Z', ultimoLoginEm: null, mfaAtivo: false, pendente: true },
    ]);
  });

  it('erro do Supabase → lança', async () => {
    const supabase = criarSupabaseFake({ erroListar: 'falha de rede' });
    await expect(listarAdministradores(supabase)).rejects.toThrow('falha de rede');
  });
});

describe('convidarAdministrador', () => {
  it('convida com sucesso, encaminha redirectTo, e devolve id/email', async () => {
    const supabase = criarSupabaseFake({ convidadoId: 'admin-x' });
    const resultado = await convidarAdministrador(supabase, {
      email: 'novo@exemplo.com',
      nome: 'Novo Admin',
      redirectTo: 'https://app.exemplo.com/admin/definir-senha',
    });
    expect(resultado).toEqual({ id: 'admin-x', email: 'novo@exemplo.com' });
    expect(supabase.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'novo@exemplo.com',
      expect.objectContaining({ redirectTo: 'https://app.exemplo.com/admin/definir-senha' }),
    );
  });

  it('erro do Supabase → lança com a mensagem original', async () => {
    const supabase = criarSupabaseFake({ erroConvidar: 'User already registered' });
    await expect(
      convidarAdministrador(supabase, { email: 'ja@exemplo.com', redirectTo: 'https://app.exemplo.com/admin/definir-senha' }),
    ).rejects.toThrow('User already registered');
  });
});

describe('revogarAdministrador', () => {
  it('chama auth.admin.deleteUser com o id', async () => {
    const supabase = criarSupabaseFake({});
    await revogarAdministrador(supabase, 'admin-x');
    expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith('admin-x');
  });

  it('erro do Supabase → lança com a mensagem original', async () => {
    const supabase = criarSupabaseFake({ erroRevogar: 'User not found' });
    await expect(revogarAdministrador(supabase, 'inexistente')).rejects.toThrow('User not found');
  });
});

describe('ehEmailJaExistente', () => {
  it.each(['User already registered', 'email exists', 'Email address already exists'])('reconhece "%s"', (mensagem) => {
    expect(ehEmailJaExistente(mensagem)).toBe(true);
  });

  it('não reconhece mensagem de erro genérica', () => {
    expect(ehEmailJaExistente('falha de rede')).toBe(false);
  });
});
