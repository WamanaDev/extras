/**
 * API-AUTH-004 — `POST /api/auth/colaborador/logout`.
 *
 * Revoga a sessão atual e limpa o cookie. **Idempotente**: "Sessão válida.
 * Sem sessão, responde 204 assim mesmo" (`API-AUTH-004-logout.md`,
 * "Autorização"). Por isso a rota é `ator: 'PUBLICO'` no `defineHandler` —
 * `ator: 'COLABORADOR'` faria o pipeline lançar `401` quando não há cookie
 * (ou cookie de sessão já revogada/expirada), o que contradiz literalmente o
 * "responde 204 assim mesmo" da spec. A rota lê o cookie manualmente (mesmo
 * mecanismo de leitura que `resolverSessaoColaborador`, `src/server/http/handler.ts`,
 * usaria, mas sem propagar o erro 401 daquele caminho) e delega a revogação
 * de fato a `processarLogout` (`src/server/auth/logout.ts`), que também é
 * idempotente por construção (token ausente/já revogado → não faz nada, sem
 * lançar). Ver `_conflitos.md`.
 */
import { cookies } from 'next/headers';
import type { PrismaClient } from '@prisma/client';
import { defineHandler } from '@/server/http/handler';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { obterPrismaAuth } from '@/server/auth/prisma-cliente';
import { hashDoToken } from '@/server/auth/credenciais';
import { processarLogout, type RepositorioLogout } from '@/server/auth/logout';
import { env } from '@/env';

function criarRepositorioLogout(prisma: PrismaClient, ip: string, userAgent: string, requestId: string): RepositorioLogout {
  return {
    async emTransacao(callback) {
      return emTransacao(prisma, (tx) =>
        callback({
          async revogarSessao(tokenHash, agora) {
            const resultado = await tx.sessaoColaborador.updateMany({
              where: { tokenHash, revogadaEm: null },
              data: { revogadaEm: agora },
            });
            if (resultado.count === 0) return null;
            const sessao = await tx.sessaoColaborador.findFirst({ where: { tokenHash }, select: { colaboradorId: true } });
            return sessao?.colaboradorId ?? null;
          },
          async auditarLogout(colaboradorId) {
            await registrarAuditoria(tx, {
              atorTipo: 'COLABORADOR',
              atorId: colaboradorId,
              acao: 'LOGOUT',
              entidade: 'colaborador',
              entidadeId: colaboradorId,
              payload: {},
              ip,
              userAgent,
              requestId,
            });
          },
        }),
      );
    },
  };
}

export const POST = defineHandler({
  ator: 'PUBLICO',
  cache: 'mutacao',
  handler: async ({ ctx, request }) => {
    const tokenCookie = request.cookies.get('sessao_colaborador')?.value ?? null;
    const tokenHash = tokenCookie ? hashDoToken(tokenCookie) : null;

    const prisma = await obterPrismaAuth();
    const repo = criarRepositorioLogout(prisma, ctx.ip, ctx.userAgent, ctx.requestId);
    await processarLogout(repo, { tokenHash, agora: ctx.agora });

    const cookieStore = await cookies();
    // `Secure` só em produção — mesmo cookie, mesma decisão de `.../pin/route.ts`.
    cookieStore.set('sessao_colaborador', '', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return undefined;
  },
});
