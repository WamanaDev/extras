/**
 * API-COL-005 — `DELETE /api/marcacoes/:id`.
 *
 * Wiring de `defineHandler` sobre
 * `@/server/services/colaborador/cancelar-extra`. "Própria marcação" nunca é
 * checado aqui: `cancelar_extra` (FN-006) já resolve inexistente/de-terceiro
 * como o mesmo `MARCACAO_INEXISTENTE` → 404 uniforme (`SEC-CONF`) — este
 * arquivo só passa `ator.colaboradorId` (sessão) como `p_ator_id` e
 * `'COLABORADOR'` como `p_ator_tipo`.
 *
 * Broadcast (`marcacao:cancelada`) só depois do commit, mesma regra de
 * `POST /api/marcacoes` (`SEC-ACID`).
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { cancelarExtraColaborador, type RespostaCancelarExtra } from '@/server/services/colaborador/cancelar-extra';
import { broadcast } from '@/server/realtime/broadcast';

const ParamsSchema = z.object({ id: z.string().uuid() });

type CorpoPublico = Omit<RespostaCancelarExtra, 'cicloId'>;

export const DELETE = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: {
    escopo: 'marcacoes_por_sessao',
    identificador: ({ request }) => request.cookies.get('sessao_colaborador')?.value ?? 'anon',
  },
  params: ParamsSchema,
  handler: async ({ ator, params, ctx }) => {
    const prisma = await obterPrisma();
    const resultado = await cancelarExtraColaborador(prisma, {
      marcacaoId: params.id,
      colaboradorId: ator.colaboradorId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    const { cicloId, ...corpo } = resultado;

    // Depois do commit — nunca antes (SEC-ACID).
    await broadcast(cicloId, 'marcacao:cancelada', { plantaoId: corpo.plantaoId });

    return corpo satisfies CorpoPublico;
  },
});
