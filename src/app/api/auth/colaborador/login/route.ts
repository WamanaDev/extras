/**
 * API-AUTH-001 — `POST /api/auth/colaborador/login`.
 *
 * Etapa 1 do login em duas etapas. Público, sem sessão criada — só emite
 * `tokenParcial` (escopo `pin-pendente`, 3 min, uso único —
 * `src/server/auth/token-parcial.ts`) para a etapa 2
 * (`API-AUTH-002-pin.md`/`API-AUTH-003-definir-pin.md`).
 *
 * CPF removido do sistema (colaborador não guarda mais CPF) — esta etapa
 * identifica o colaborador só pela matrícula (formulário em
 * `/login/matricula`).
 *
 * Rate limit duplo (`disponibilidade.md`): IP via `defineHandler` (escopo
 * `login_ip`) + matrícula via checagem manual (`login_matricula`) — o
 * pipeline de `defineHandler` só declara um escopo por rota.
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { defineHandler } from '@/server/http/handler';
import { erroLimiteExcedido } from '@/server/http/erros';
import { verificarRateLimit } from '@/server/http/rate-limit';
import { emTransacao } from '@/server/db/tx';
import { obterPrismaAuth } from '@/server/auth/prisma-cliente';
import { processarLogin, type RepositorioLogin } from '@/server/auth/login';

const BodySchema = z.object({
  matricula: z.string().trim().min(1, 'Matrícula obrigatória.'),
});

function criarRepositorioLogin(prisma: PrismaClient): RepositorioLogin {
  return {
    async buscarPorMatricula(matricula) {
      return prisma.colaborador.findFirst({
        where: { matricula },
        select: { id: true, ativo: true, bloqueadoAte: true, tentativasFalhas: true, pinHash: true },
      });
    },
    async emTransacao(callback) {
      return emTransacao(prisma, (tx) =>
        callback({
          async registrarTentativa(dados) {
            await tx.tentativaLogin.create({
              data: {
                colaboradorId: dados.colaboradorId,
                matricula: dados.matricula,
                sucesso: dados.sucesso,
                motivo: dados.motivo,
                ip: dados.ip,
                userAgent: dados.userAgent,
              },
            });
          },
          async atualizarAposFalha(colaboradorId, dados) {
            await tx.colaborador.update({
              where: { id: colaboradorId },
              data: { tentativasFalhas: dados.tentativasFalhas, bloqueadoAte: dados.bloqueadoAte },
            });
          },
          async atualizarAposSucesso(colaboradorId) {
            await tx.colaborador.update({ where: { id: colaboradorId }, data: { tentativasFalhas: 0, bloqueadoAte: null } });
          },
        }),
      );
    },
  };
}

export const POST = defineHandler({
  ator: 'PUBLICO',
  rateLimit: { escopo: 'login_ip' },
  body: BodySchema,
  cache: 'mutacao',
  handler: async ({ body, ctx }) => {
    const limiteMatricula = await verificarRateLimit('login_matricula', body.matricula);
    if (!limiteMatricula.permitido) {
      throw erroLimiteExcedido(limiteMatricula.retryAfter);
    }

    const prisma = await obterPrismaAuth();
    const repo = criarRepositorioLogin(prisma);
    return processarLogin(repo, {
      matricula: body.matricula,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      agora: ctx.agora,
    });
  },
});
