/**
 * Implementação de `POST /api/admin/colaboradores/:id/revogar-sessoes` (API-ADM-COL-010).
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

const RevogarSessoesSchema = z
  .object({
    motivo: z.string().trim().min(1, 'Motivo é obrigatório.'),
  })
  .strict();

export function criarHandlerRevogarSessoes(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    params: ParamsSchema,
    body: RevogarSessoesSchema,
    handler: async ({ params, body, ator, ctx }) => {
      const colaborador = await prisma.colaborador.findUnique({ where: { id: params.id } });
      if (!colaborador) throw erroNaoEncontrado('Colaborador não encontrado.');

      const revogadas = await emTransacao(prisma, async (tx) => {
        const resultado = await tx.sessaoColaborador.updateMany({
          where: { colaboradorId: params.id, revogadaEm: null },
          data: { revogadaEm: ctx.agora },
        });

        await registrarAuditoria(tx, {
          atorTipo: 'ADMIN',
          atorId: ator.adminId,
          acao: 'SESSAO_REVOGADA',
          entidade: 'colaborador',
          entidadeId: params.id,
          payload: { motivo: body.motivo, quantidade: resultado.count },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        });

        return resultado.count;
      });

      return { revogadas };
    },
  });
}
