/**
 * API-AUTH-006 — `POST /api/auth/admin/login`.
 *
 * Login administrativo delegado ao Supabase Auth (`@supabase/ssr`), MFA
 * obrigatório. `ClienteAuthAdmin` (`src/server/auth/admin-login.ts`) isola o
 * SDK — esta rota só implementa a porta sobre o client real; a lógica de
 * MFA/auditoria vive em `processarAdminLogin`, testável sem rede.
 *
 * Rate limit próprio, independente do fluxo de colaborador (`_conflitos.md`,
 * novo item sobre `login_admin_email`/`login_admin_ip` em
 * `src/server/http/rate-limit.ts`) — nunca reaproveita `login_ip`/
 * `login_matricula` (isso acoplaria os dois fluxos no mesmo balde de Redis).
 *
 * `cookies: { setAll }` aqui **grava** de volta (diferente do adaptador
 * somente-leitura de `resolverSessaoAdmin` em `src/server/http/handler.ts`,
 * usado só para *ler* sessão existente) — é esta rota quem efetivamente cria
 * a sessão do admin, então precisa deixar o `@supabase/ssr` setar o cookie de
 * sessão na resposta.
 */
import { z } from 'zod';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { PrismaClient } from '@prisma/client';
import { defineHandler } from '@/server/http/handler';
import { erroLimiteExcedido } from '@/server/http/erros';
import { verificarRateLimit } from '@/server/http/rate-limit';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { obterPrismaAuth } from '@/server/auth/prisma-cliente';
import { env } from '@/env';
import { processarAdminLogin, type ClienteAuthAdmin, type RepositorioAdminLogin } from '@/server/auth/admin-login';

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
      if (error || !data.user) return { ok: false };
      const metadata = data.user.user_metadata as Record<string, unknown> | undefined;
      const nome = typeof metadata?.nome === 'string' ? metadata.nome : typeof metadata?.full_name === 'string' ? (metadata.full_name as string) : null;
      return { ok: true, userId: data.user.id, email: data.user.email ?? email, nome };
    },
    async listarFatoresMfa() {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error || !data) return [];
      return data.all.map((fator) => ({ id: fator.id, status: fator.status as 'verified' | 'unverified' }));
    },
    async nivelAsseguranca() {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error || !data) return { atual: 'aal1', proximo: 'aal1' };
      return { atual: data.currentLevel ?? 'aal1', proximo: data.nextLevel ?? 'aal1' };
    },
    async desafiarFator(factorId) {
      const { data, error } = await supabase.auth.mfa.challenge({ factorId });
      if (error || !data) throw new Error('Falha ao iniciar desafio MFA.');
      return data.id;
    },
  };
}

function criarRepositorioAdminLogin(prisma: PrismaClient, ip: string, userAgent: string, requestId: string): RepositorioAdminLogin {
  return {
    async auditar(evento) {
      await emTransacao(prisma, (tx) =>
        registrarAuditoria(tx, {
          atorTipo: 'ADMIN',
          atorId: evento.adminId,
          acao: evento.sucesso ? 'LOGIN_ADMIN_SUCESSO' : 'LOGIN_ADMIN_FALHA',
          entidade: 'admin',
          entidadeId: evento.adminId,
          payload: { email: evento.email },
          ip,
          userAgent,
          requestId,
        }),
      );
    },
  };
}

export const POST = defineHandler({
  ator: 'PUBLICO',
  rateLimit: { escopo: 'login_admin_ip' },
  body: BodySchema,
  cache: 'mutacao',
  handler: async ({ body, ctx }) => {
    const limiteEmail = await verificarRateLimit('login_admin_email', body.email);
    if (!limiteEmail.permitido) throw erroLimiteExcedido(limiteEmail.retryAfter);

    const auth = await criarClienteAuthAdmin();
    const prisma = await obterPrismaAuth();
    const repo = criarRepositorioAdminLogin(prisma, ctx.ip, ctx.userAgent, ctx.requestId);

    return processarAdminLogin(auth, repo, { email: body.email, senha: body.senha });
  },
});
