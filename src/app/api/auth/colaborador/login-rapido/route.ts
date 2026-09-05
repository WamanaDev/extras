/**
 * `POST /api/auth/colaborador/login-rapido` — matrícula + PIN.
 *
 * Endpoint adicional, não entregável de `API-AUTH-001`/`002` (ver docstring
 * de `src/server/auth/login-rapido.ts` e `_conflitos.md`, item 33) — decisão
 * do usuário, aprovada em conversa. Mesmo padrão de wiring de
 * `.../pin/route.ts` (rate limit por IP via `defineHandler` + por matrícula
 * manual, cookie via `cookies()` do Next 15).
 */
import { z } from 'zod';
import { cookies } from 'next/headers';
import type { PrismaClient } from '@prisma/client';
import { env } from '@/env';
import { defineHandler } from '@/server/http/handler';
import { erroLimiteExcedido } from '@/server/http/erros';
import { verificarRateLimit } from '@/server/http/rate-limit';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { obterPrismaAuth } from '@/server/auth/prisma-cliente';
import { criarSessaoColaborador } from '@/server/auth/sessao';
import { processarLoginRapido, type RepositorioLoginRapido } from '@/server/auth/login-rapido';

const BodySchema = z.object({
  matricula: z.string().trim().min(1, 'Matrícula obrigatória.'),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN deve ter de 4 a 6 dígitos.'),
});

const DURACAO_SESSAO_SEGUNDOS = 8 * 60 * 60;

function criarRepositorioLoginRapido(prisma: PrismaClient, ip: string, userAgent: string, requestId: string): RepositorioLoginRapido {
  return {
    async buscarPorMatricula(matricula) {
      const colaborador = await prisma.colaborador.findFirst({
        where: { matricula },
        select: {
          id: true,
          nome: true,
          matricula: true,
          pinHash: true,
          ativo: true,
          bloqueadoAte: true,
          tentativasFalhas: true,
          rt: { select: { nome: true } },
        },
      });
      if (!colaborador) return null;
      // rt.codigo não existe no schema (mesma resolução do item 9/12(b) de _conflitos.md) — alimenta com rt.nome.
      return { ...colaborador, rtCodigo: colaborador.rt.nome, rtNome: colaborador.rt.nome };
    },
    async registrarTentativaSemColaborador(matricula) {
      await prisma.tentativaLogin.create({
        data: { colaboradorId: null, matricula, sucesso: false, motivo: 'CREDENCIAIS_INVALIDAS', ip, userAgent },
      });
    },
    async emTransacao(colaboradorId, callback) {
      return emTransacao(prisma, (tx) =>
        callback({
          async registrarTentativaEAuditoria(sucesso, motivo) {
            const colaborador = await tx.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, select: { matricula: true } });
            await tx.tentativaLogin.create({
              data: { colaboradorId, matricula: colaborador.matricula, sucesso, motivo, ip, userAgent },
            });
            await registrarAuditoria(tx, {
              atorTipo: 'COLABORADOR',
              atorId: colaboradorId,
              acao: sucesso ? 'LOGIN_SUCESSO' : 'LOGIN_FALHA',
              entidade: 'colaborador',
              entidadeId: colaboradorId,
              payload: { etapa: 'login-rapido' },
              ip,
              userAgent,
              requestId,
            });
          },
          async atualizarAposFalha(dados) {
            await tx.colaborador.update({ where: { id: colaboradorId }, data: dados });
          },
          async atualizarAposSucessoComSessao() {
            await tx.colaborador.update({ where: { id: colaboradorId }, data: { tentativasFalhas: 0, bloqueadoAte: null } });
            return criarSessaoColaborador(tx, { colaboradorId, ip, userAgent, agora: new Date() });
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
    if (!limiteMatricula.permitido) throw erroLimiteExcedido(limiteMatricula.retryAfter);

    const prisma = await obterPrismaAuth();
    const repo = criarRepositorioLoginRapido(prisma, ctx.ip, ctx.userAgent, ctx.requestId);
    const resultado = await processarLoginRapido(repo, { matricula: body.matricula, pin: body.pin, agora: ctx.agora });

    const cookieStore = await cookies();
    cookieStore.set('sessao_colaborador', resultado.token, {
      httpOnly: true,
      // `Secure` só em produção — ver `.../pin/route.ts` (mesmo cookie, mesma
      // decisão): em dev, exigir `Secure` faz o navegador descartar o cookie
      // ao acessar por IP da rede local via HTTP puro (achado em uso real).
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: DURACAO_SESSAO_SEGUNDOS,
    });

    return { colaborador: resultado.colaborador, expiraEm: resultado.expiraEm };
  },
});
