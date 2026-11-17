/**
 * API-AUTH-006 — `POST /api/auth/admin/login` (etapa 1: senha).
 *
 * Confere a senha no Supabase Auth (`@supabase/ssr`) e manda o código de
 * 6 dígitos pro WhatsApp do admin — o login termina em
 * `POST /api/auth/admin/codigo/verificar`. Lógica em `processarAdminLogin`
 * (`src/server/auth/admin-login.ts`), testável sem rede; esta rota só
 * implementa as portas sobre o client real.
 *
 * Rate limit próprio, independente do fluxo de colaborador
 * (`login_admin_email`/`login_admin_ip` em `src/server/http/rate-limit.ts`)
 * — também limita quantos códigos de WhatsApp um e-mail dispara.
 *
 * `cookies: { setAll }` aqui **grava** de volta: é esta rota quem cria a
 * sessão do Supabase. Essa sessão sozinha não vale como admin — os guardas
 * exigem também o cookie `admin_2fa` (`src/server/auth/sessao-admin.ts`).
 * Por isso também apaga um `admin_2fa` antigo que tenha sobrado.
 */
import { z } from 'zod';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { defineHandler } from '@/server/http/handler';
import { erroLimiteExcedido } from '@/server/http/erros';
import { verificarRateLimit } from '@/server/http/rate-limit';
import { obterPrismaAuth } from '@/server/auth/prisma-cliente';
import { env } from '@/env';
import { processarAdminLogin, type ClienteAuthAdmin, type RepositorioAdminLogin } from '@/server/auth/admin-login';
import { auditarLoginAdmin } from '@/server/auth/auditoria-login-admin';
import { enviarCodigoAdmin } from '@/server/auth/enviar-codigo-admin';
import { nomeDoUserMetadata } from '@/server/auth/sessao-admin';
import { NOME_COOKIE_SEGUNDO_FATOR, sessionIdDoAccessToken, whatsappDoAppMetadata } from '@/server/auth/segundo-fator';

const BodySchema = z.object({
  email: z.string().trim().email('E-mail inválido.'),
  senha: z.string().min(1, 'Senha obrigatória.'),
});

async function criarClienteAuthAdmin(): Promise<ClienteAuthAdmin> {
  const cookieStore = await cookies();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll().map((c) => ({ name: c.name, value: c.value })),
      setAll: (cookiesToSet) => {
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
      const sessionId = sessionIdDoAccessToken(data.session.access_token);
      if (!sessionId) return { ok: false };
      return {
        ok: true,
        userId: data.user.id,
        email: data.user.email ?? email,
        nome: nomeDoUserMetadata(data.user.user_metadata),
        whatsapp: whatsappDoAppMetadata(data.user.app_metadata),
        sessionId,
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

    const cookieStore = await cookies();
    cookieStore.delete(NOME_COOKIE_SEGUNDO_FATOR);

    const auth = await criarClienteAuthAdmin();
    const prisma = await obterPrismaAuth();
    const repo: RepositorioAdminLogin = {
      auditar: (evento) => auditarLoginAdmin(prisma, ctx, evento),
      enviarCodigo: enviarCodigoAdmin,
    };

    return processarAdminLogin(auth, repo, { email: body.email, senha: body.senha });
  },
});
