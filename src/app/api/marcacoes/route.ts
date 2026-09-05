/**
 * API-COL-004 — `POST /api/marcacoes`. "Rota de maior contenção e maior
 * risco do sistema" — **alteração exige revisão humana**.
 *
 * Só faz o wiring de `defineHandler` (`contrato-comum.md`) sobre
 * `@/server/services/colaborador/marcar-extra` — nenhuma regra de negócio
 * aqui, só:
 * - `colaboradorId` **sempre** de `ator.colaboradorId` (sessão) — o schema de
 *   body abaixo nem declara um campo `colaboradorId`; se o cliente enviar um,
 *   o `safeParse` do Zod o descarta silenciosamente (spec, teste 5: "ignorado").
 * - Idempotência (`Idempotency-Key`, `contrato-comum.md`/spec Fluxo passo 2/6):
 *   consulta o Redis (`@/server/services/colaborador/idempotencia`) **antes**
 *   de chamar `marcarExtraColaborador`; se houver resultado, devolve-o sem
 *   tocar o banco de novo. Grava o resultado só depois do commit.
 * - Broadcast (`marcacao:criada`, `@/server/realtime/broadcast`) só **depois**
 *   do `await marcarExtraColaborador(...)` resolver — nunca antes do commit
 *   (spec, teste 8; `SEC-ACID`).
 * - Rate limit `marcacoes_por_sessao` (10/min, `disponibilidade.md`) — mesmo
 *   escopo já usado por `POST /api/admin/marcacoes` (API-ADM-MAR-002).
 *
 * `cicloId` retornado por `marcarExtraColaborador` não faz parte do contrato
 * de resposta da spec — usado só aqui para o broadcast, removido do corpo
 * antes de devolver ao cliente (e antes de gravar na chave de idempotência,
 * para que uma resposta cacheada tenha exatamente o mesmo formato de uma
 * resposta fresca).
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { marcarExtraColaborador, type RespostaMarcarExtra } from '@/server/services/colaborador/marcar-extra';
import { criarStoreIdempotenciaRedis } from '@/server/services/colaborador/idempotencia';
import { broadcast } from '@/server/realtime/broadcast';

const MarcarBodySchema = z.object({
  plantaoId: z.string().uuid(),
});

type CorpoPublico = Omit<RespostaMarcarExtra, 'cicloId'>;

export const POST = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: {
    escopo: 'marcacoes_por_sessao',
    identificador: ({ request }) => request.cookies.get('sessao_colaborador')?.value ?? 'anon',
  },
  body: MarcarBodySchema,
  statusSucesso: 201,
  handler: async ({ ator, body, ctx }) => {
    const store = criarStoreIdempotenciaRedis();

    if (ctx.idempotencyKey) {
      const cacheado = await store.buscar(ator.colaboradorId, ctx.idempotencyKey);
      if (cacheado) return cacheado as CorpoPublico;
    }

    const prisma = await obterPrisma();
    const resultado = await marcarExtraColaborador(prisma, {
      plantaoId: body.plantaoId,
      colaboradorId: ator.colaboradorId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    const { cicloId, ...corpo } = resultado;

    if (ctx.idempotencyKey) {
      await store.gravar(ator.colaboradorId, ctx.idempotencyKey, corpo);
    }

    // Depois do commit (marcarExtraColaborador já resolveu) — nunca antes.
    await broadcast(cicloId, 'marcacao:criada', { plantaoId: corpo.plantaoId });

    return corpo;
  },
});
