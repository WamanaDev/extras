/**
 * API-AUTH-003 — `POST /api/auth/colaborador/definir-pin`.
 *
 * Define o PIN no primeiro acesso ou após reset administrativo, a partir do
 * `tokenParcial` da etapa 1 (`API-AUTH-001-login.md`), e cria a sessão em
 * seguida — mesmo formato de resposta de `API-AUTH-002`
 * (`.../colaborador/pin/route.ts`, cujo padrão de cookie/rate-limit este
 * arquivo replica).
 *
 * Ver o cabeçalho de `.../colaborador/pin/route.ts` para o porquê de usar
 * `cookies()` de `next/headers` em vez de um mecanismo de `Set-Cookie` no
 * retorno do `handler` — mesma decisão, mesmo motivo (`_conflitos.md`, item 12).
 */
import { z } from 'zod';
import { cookies } from 'next/headers';
import type { PrismaClient } from '@prisma/client';
import { env } from '@/env';
import { defineHandler } from '@/server/http/handler';
import { erroLimiteExcedido, erroTokenInvalido } from '@/server/http/erros';
import { verificarRateLimit } from '@/server/http/rate-limit';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { obterPrismaAuth } from '@/server/auth/prisma-cliente';
import { consumirTokenParcial } from '@/server/auth/token-parcial';
import { criarSessaoColaborador } from '@/server/auth/sessao';
import { processarDefinirPin, type RepositorioDefinirPin } from '@/server/auth/definir-pin';

const BodySchema = z.object({
  tokenParcial: z.string().min(1),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN deve ter de 4 a 6 dígitos.'),
  confirmacao: z.string().regex(/^\d{4,6}$/, 'Confirmação deve ter de 4 a 6 dígitos.'),
});

const DURACAO_SESSAO_SEGUNDOS = 8 * 60 * 60;

function criarRepositorioDefinirPin(
  prisma: PrismaClient,
  ip: string,
  userAgent: string,
  requestId: string,
): RepositorioDefinirPin {
  return {
    async buscarPorId(colaboradorId) {
      const colaborador = await prisma.colaborador.findUnique({
        where: { id: colaboradorId },
        select: {
          id: true,
          nome: true,
          matricula: true,
          ativo: true,
          pinHash: true,
          precisaTrocarPin: true,
          rt: { select: { nome: true } },
        },
      });
      if (!colaborador) return null;
      // rt.codigo não existe no schema — mesma resolução do item 12(b) de `_conflitos.md`.
      return { ...colaborador, rtCodigo: colaborador.rt.nome, rtNome: colaborador.rt.nome };
    },
    async emTransacao(colaboradorId, callback) {
      return emTransacao(prisma, (tx) =>
        callback({
          async gravarPinEcriarSessao(pinHash) {
            await tx.colaborador.update({
              where: { id: colaboradorId },
              data: { pinHash, pinDefinidoEm: new Date(), precisaTrocarPin: false, tentativasFalhas: 0, bloqueadoAte: null },
            });
            await registrarAuditoria(tx, {
              atorTipo: 'COLABORADOR',
              atorId: colaboradorId,
              acao: 'PIN_DEFINIDO',
              entidade: 'colaborador',
              entidadeId: colaboradorId,
              payload: {},
              ip,
              userAgent,
              requestId,
            });
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
    const repo = criarRepositorioDefinirPin(prisma, ctx.ip, ctx.userAgent, ctx.requestId);
    const resultado = await processarDefinirPin(repo, {
      colaboradorId,
      pin: body.pin,
      confirmacao: body.confirmacao,
    });

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
