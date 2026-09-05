/**
 * API-AUTH-002 — `POST /api/auth/colaborador/pin`.
 *
 * Etapa 2 do login: consome o `tokenParcial` da etapa 1
 * (`API-AUTH-001-login.md`), valida o PIN e cria a sessão do colaborador.
 *
 * Cookie de sessão: `defineHandler`/`contrato-comum.md` não expõe nenhum
 * mecanismo para uma rota escrever `Set-Cookie` a partir do valor de retorno
 * do `handler` (o pipeline serializa o retorno direto como corpo JSON — ver
 * `src/server/http/handler.ts`, passo "serialização"). Em vez de alterar
 * esse pipeline compartilhado (tocado por outras 8 rodadas paralelas em
 * `04-api/*`), a rota usa `cookies()` de `next/headers` — API do Next 15
 * (App Router) que grava `Set-Cookie` na resposta da requisição corrente via
 * `AsyncLocalStorage`, funcionando em qualquer ponto da árvore de chamadas
 * de um Route Handler, mesmo dentro do `handler` de `defineHandler`. Ver
 * `_conflitos.md`, item 12(f), para o registro desta decisão.
 *
 * Nome do cookie: `sessao_colaborador` — mesma resolução do item 12(a) de
 * `_conflitos.md` (a spec nomeia só `sessao`; mantido o nome já assumido por
 * `resolverSessaoColaborador` em `handler.ts`).
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
import { consumirTokenParcial } from '@/server/auth/token-parcial';
import { criarSessaoColaborador } from '@/server/auth/sessao';
import { processarPin, type RepositorioPin } from '@/server/auth/validar-pin';
import { erroTokenInvalido } from '@/server/http/erros';

const BodySchema = z.object({
  tokenParcial: z.string().min(1),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN deve ter de 4 a 6 dígitos.'),
});

const DURACAO_SESSAO_SEGUNDOS = 8 * 60 * 60;

function criarRepositorioPin(prisma: PrismaClient, ip: string, userAgent: string, requestId: string): RepositorioPin {
  return {
    async buscarPorId(colaboradorId) {
      const colaborador = await prisma.colaborador.findUnique({
        where: { id: colaboradorId },
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
      // rt.codigo não existe no schema — resolução do item 9/12(b) de _conflitos.md: alimenta com rt.nome.
      return { ...colaborador, rtCodigo: colaborador.rt.nome, rtNome: colaborador.rt.nome };
    },
    async emTransacao(colaboradorId, callback) {
      return emTransacao(prisma, (tx) =>
        callback({
          async registrarTentativaEAuditoria(sucesso) {
            const colaborador = await tx.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, select: { matricula: true } });
            await tx.tentativaLogin.create({
              data: { colaboradorId, matricula: colaborador.matricula, sucesso, motivo: sucesso ? null : 'PIN_INCORRETO', ip, userAgent },
            });
            await registrarAuditoria(tx, {
              atorTipo: 'COLABORADOR',
              atorId: colaboradorId,
              acao: sucesso ? 'LOGIN_SUCESSO' : 'LOGIN_FALHA',
              entidade: 'colaborador',
              entidadeId: colaboradorId,
              payload: { etapa: 'pin' },
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
    const consumo = await consumirTokenParcial(body.tokenParcial, ctx.agora);
    if (!consumo.ok) throw erroTokenInvalido();

    const colaboradorId = consumo.payload.sub;

    const limite = await verificarRateLimit('login_matricula', colaboradorId);
    if (!limite.permitido) throw erroLimiteExcedido(limite.retryAfter);

    const prisma = await obterPrismaAuth();
    const repo = criarRepositorioPin(prisma, ctx.ip, ctx.userAgent, ctx.requestId);
    const resultado = await processarPin(repo, { colaboradorId, pin: body.pin, agora: ctx.agora });

    const cookieStore = await cookies();
    cookieStore.set('sessao_colaborador', resultado.token, {
      httpOnly: true,
      // `Secure` só em produção (HTTPS de verdade) — em dev, exigir `Secure`
      // faz o navegador descartar o cookie silenciosamente ao acessar por IP
      // da rede local via HTTP puro (ex.: testar login pelo celular), já que
      // só `localhost` tem a exceção de "origem segura" sem TLS. Achado em
      // uso real — login "não fazia nada" porque a sessão nunca era gravada.
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: DURACAO_SESSAO_SEGUNDOS,
    });

    return { colaborador: resultado.colaborador, expiraEm: resultado.expiraEm };
  },
});
