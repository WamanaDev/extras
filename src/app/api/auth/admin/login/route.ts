/**
 * API-AUTH-006 — `POST /api/auth/admin/login`.
 *
 * Confere e-mail + senha no Supabase Auth (`@supabase/ssr`) — sem segundo
 * fator, por decisão do produto (`_conflitos.md`). Lógica em
 * `processarAdminLogin` (`src/server/auth/admin-login.ts`), testável sem
 * rede; esta rota só implementa as portas sobre o client real.
 *
 * Rate limit próprio, independente do fluxo de colaborador
 * (`login_admin_email`/`login_admin_ip` em `src/server/http/rate-limit.ts`).
 *
 * `cookies: { setAll }` aqui **grava** de volta: é esta rota quem cria a
 * sessão do Supabase, que os guardas (`src/server/auth/sessao-admin.ts`)
 * passam a aceitar.
 */
import { z } from 'zod';
import { createServerClient } from '@supabase/ssr';
import type { SetAllCookies } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { defineHandler } from '@/server/http/handler';
import { erroLimiteExcedido } from '@/server/http/erros';
import { verificarRateLimit } from '@/server/http/rate-limit';
import { obterPrismaAuth } from '@/server/auth/prisma-cliente';
import { env } from '@/env';
import { processarAdminLogin, type ClienteAuthAdmin, type RepositorioAdminLogin } from '@/server/auth/admin-login';
import { auditarLoginAdmin } from '@/server/auth/auditoria-login-admin';
import { nomeDoUserMetadata } from '@/server/auth/sessao-admin';

const BodySchema = z.object({
  email: z.string().trim().email('E-mail inválido.'),
  senha: z.string().min(1, 'Senha obrigatória.'),
});

async function criarClienteAuthAdmin(): Promise<ClienteAuthAdmin> {
  const cookieStore = await cookies();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll().map((c) => ({ name: c.name, value: c.value })),
      setAll: (cookiesToSet: Parameters<SetAllCookies>[0]) => {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });

  return {
    async entrar(email, senha) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error || !data.user || !data.session) return { ok: false };
      return {
        ok: true,
        userId: data.user.id,
        email: data.user.email ?? email,
        nome: nomeDoUserMetadata(data.user.user_metadata),
      };
    },
  };
}

export const POST = defineHandler({
  ator: 'PUBLICO',
  rateLimit: { escopo: 'login_admin_ip' },
  body: BodySchema,
  cache: 'mutacao',
  handler: async ({ body, ctx }) => {
    const limiteEmail = await verificarRateLimit('login_admin_email', body.email.toLowerCase());
    if (!limiteEmail.permitido) throw erroLimiteExcedido(limiteEmail.retryAfter);

    const auth = await criarClienteAuthAdmin();
    const prisma = await obterPrismaAuth();
    const repo: RepositorioAdminLogin = {
      auditar: (evento) => auditarLoginAdmin(prisma, ctx, evento),
    };

    return processarAdminLogin(auth, repo, { email: body.email, senha: body.senha });
  },
});
