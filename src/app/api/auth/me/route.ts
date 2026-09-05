/**
 * API-AUTH-005 — `GET /api/auth/me`.
 *
 * Devolve o ator da sessão (colaborador ou admin) — usado no boot do cliente
 * para decidir a rota inicial. `ator: 'QUALQUER'` no `defineHandler` aceita
 * as duas sessões; a formatação da resposta e a renovação deslizante ficam em
 * `src/server/auth/me.ts` (`processarMe`), testável sem Prisma real.
 *
 * `Cache-Control: private, no-store` via `cache: 'pessoal'`
 * (`src/server/http/handler.ts`) — nunca cacheia dado pessoal.
 */
import type { PrismaClient } from '@prisma/client';
import { defineHandler } from '@/server/http/handler';
import { obterPrismaAuth } from '@/server/auth/prisma-cliente';
import { processarMe, type RepositorioMe } from '@/server/auth/me';

function criarRepositorioMe(prisma: PrismaClient): RepositorioMe {
  return {
    async buscarColaborador(colaboradorId) {
      const colaborador = await prisma.colaborador.findUnique({
        where: { id: colaboradorId },
        select: { id: true, nome: true, matricula: true, rt: { select: { nome: true } } },
      });
      if (!colaborador) return null;
      // rt.codigo não existe no schema — mesma resolução do item 12(b) de `_conflitos.md`.
      return { id: colaborador.id, nome: colaborador.nome, matricula: colaborador.matricula, rtCodigo: colaborador.rt.nome, rtNome: colaborador.rt.nome };
    },
    async buscarSessao(sessaoId) {
      const sessao = await prisma.sessaoColaborador.findUnique({
        where: { id: sessaoId },
        select: { criadoEm: true, expiraEm: true },
      });
      return sessao ?? null;
    },
    async renovarSessao(sessaoId, novaExpiraEm) {
      await prisma.sessaoColaborador.update({ where: { id: sessaoId }, data: { expiraEm: novaExpiraEm } });
    },
  };
}

export const GET = defineHandler({
  ator: 'QUALQUER',
  cache: 'pessoal',
  handler: async ({ ator, ctx }) => {
    const prisma = await obterPrismaAuth();
    const repo = criarRepositorioMe(prisma);
    return processarMe(repo, ator, ctx.agora);
  },
});
