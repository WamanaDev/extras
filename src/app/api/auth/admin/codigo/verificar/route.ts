/**
 * `POST /api/auth/admin/codigo/verificar` — etapa 2 do login de admin
 * (`API-AUTH-006`): confere o código do WhatsApp e grava o cookie
 * `admin_2fa` que completa a sessão (ver `src/server/auth/segundo-fator.ts`).
 *
 * Código errado conta tentativa (5 por código, depois precisa pedir outro)
 * e audita `LOGIN_ADMIN_FALHA`; acerto audita `LOGIN_ADMIN_SUCESSO`.
 */
import { z } from 'zod';
import { cookies } from 'next/headers';
import { env } from '@/env';
import { defineHandler } from '@/server/http/handler';
import { erroCodigoExpirado, erroCodigoInvalido, erroNaoAutenticado } from '@/server/http/erros';
import { obterEstadoSessaoAdmin } from '@/server/auth/sessao-admin';
import { verificarCodigoAdmin } from '@/server/auth/enviar-codigo-admin';
import { auditarLoginAdmin } from '@/server/auth/auditoria-login-admin';
import { obterPrismaAuth } from '@/server/auth/prisma-cliente';
import {
  DURACAO_SEGUNDO_FATOR_SEGUNDOS,
  NOME_COOKIE_SEGUNDO_FATOR,
  assinarCookieSegundoFator,
} from '@/server/auth/segundo-fator';

const BodySchema = z.object({
  codigo: z.string().trim().regex(/^\d{6}$/, 'O código tem 6 dígitos.'),
});

export const POST = defineHandler({
  ator: 'PUBLICO',
  rateLimit: { escopo: 'login_admin_ip' },
  body: BodySchema,
  cache: 'mutacao',
  handler: async ({ body, ctx }) => {
    const sessao = await obterEstadoSessaoAdmin();
    if (sessao.estado === 'SEM_SESSAO') throw erroNaoAutenticado();
    const { usuario } = sessao;
    const emailAuditoria = usuario.email ?? '';

    if (sessao.estado === 'PENDENTE_2FA') {
      const resultado = await verificarCodigoAdmin({ userId: usuario.id, sessionId: usuario.sessionId, codigo: body.codigo });
      if (resultado !== 'OK') {
        const prisma = await obterPrismaAuth();
        await auditarLoginAdmin(prisma, ctx, { sucesso: false, email: emailAuditoria, adminId: usuario.id, motivo: `CODIGO_${resultado}` });
        if (resultado === 'INVALIDO') throw erroCodigoInvalido();
        throw erroCodigoExpirado();
      }

      const cookieStore = await cookies();
      cookieStore.set(NOME_COOKIE_SEGUNDO_FATOR, assinarCookieSegundoFator(env.SESSION_SECRET, usuario.id, usuario.sessionId, ctx.agora), {
        httpOnly: true,
        // Mesmo racional do cookie de colaborador: `Secure` só em produção.
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: DURACAO_SEGUNDO_FATOR_SEGUNDOS,
      });

      const prisma = await obterPrismaAuth();
      await auditarLoginAdmin(prisma, ctx, { sucesso: true, email: emailAuditoria, adminId: usuario.id });
    }

    return { admin: { id: usuario.id, email: usuario.email, nome: usuario.nome } };
  },
});
