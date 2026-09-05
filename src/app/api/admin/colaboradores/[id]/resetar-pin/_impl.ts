/**
 * Implementação de `POST /api/admin/colaboradores/:id/resetar-pin` (API-ADM-COL-007).
 *
 * Separado de `route.ts` — ver docstring de `desbloquear/_impl.ts` (mesmo
 * motivo: Next.js 15 só aceita métodos HTTP como export de `route.ts`).
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { defineHandler } from '@/server/http/handler';
import { erroNaoEncontrado } from '@/server/http/erros';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';

const ParamsSchema = z.object({ id: z.string().uuid() });

const ResetarPinSchema = z
  .object({
    /** Obrigatório (CIA "R" da spec): reset de credencial é o pedido mais comum em engenharia social. */
    motivo: z.string().trim().min(1, 'Motivo é obrigatório.'),
  })
  .strict();

export function criarHandlerResetarPin(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    params: ParamsSchema,
    body: ResetarPinSchema,
    handler: async ({ params, body, ator, ctx }) => {
      const colaborador = await prisma.colaborador.findUnique({ where: { id: params.id } });
      if (!colaborador) throw erroNaoEncontrado('Colaborador não encontrado.');

      const sessoesRevogadas = await emTransacao(prisma, async (tx) => {
        await tx.colaborador.update({
          where: { id: params.id },
          data: {
            pinHash: null,
            precisaTrocarPin: true,
            // Desbloqueia junto (CIA "D" da spec): evita um segundo chamado
            // quando o motivo do bloqueio era o PIN esquecido.
            tentativasFalhas: 0,
            bloqueadoAte: null,
          },
        });

        const resultado = await tx.sessaoColaborador.updateMany({
          where: { colaboradorId: params.id, revogadaEm: null },
          data: { revogadaEm: ctx.agora },
        });

        await registrarAuditoria(tx, {
          atorTipo: 'ADMIN',
          atorId: ator.adminId,
          acao: 'PIN_RESETADO',
          entidade: 'colaborador',
          entidadeId: params.id,
          payload: { motivo: body.motivo, sessoesRevogadas: resultado.count },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        });

        return resultado.count;
      });

      return { id: params.id, pinDefinido: false, sessoesRevogadas };
    },
  });
}
