/**
 * Implementação de `POST /api/admin/colaboradores/:id/desbloquear` (API-ADM-COL-008).
 *
 * Separado de `route.ts` porque o Next.js 15 só aceita, como export de um
 * arquivo `route.ts`, os métodos HTTP reconhecidos (`GET`/`POST`/...) e um
 * pequeno allowlist (`config`, `dynamic`, etc.) — qualquer outro export
 * (aqui, a fábrica usada pelo teste para injetar um Prisma Client fake)
 * quebra o checador de tipos gerado em `.next/types/` durante `next build`.
 * Ver `_conflitos.md`.
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { defineHandler } from '@/server/http/handler';
import { erroNaoEncontrado } from '@/server/http/erros';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';

const ParamsSchema = z.object({ id: z.string().uuid() });

const LIMITE_TENTATIVAS_RECENTES = 10;

interface TentativaRecente {
  ip: string;
  criadoEm: string;
  motivo: string | null;
}

export function criarHandlerDesbloquear(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    params: ParamsSchema,
    handler: async ({ params, ator, ctx }) => {
      const colaborador = await prisma.colaborador.findUnique({ where: { id: params.id } });
      if (!colaborador) throw erroNaoEncontrado('Colaborador não encontrado.');

      const tentativasRecentes = await emTransacao(prisma, async (tx) => {
        await tx.colaborador.update({
          where: { id: params.id },
          data: { tentativasFalhas: 0, bloqueadoAte: null },
        });

        const tentativas = await tx.tentativaLogin.findMany({
          where: { colaboradorId: params.id },
          orderBy: { criadoEm: 'desc' },
          take: LIMITE_TENTATIVAS_RECENTES,
          select: { ip: true, criadoEm: true, motivo: true },
        });

        await registrarAuditoria(tx, {
          atorTipo: 'ADMIN',
          atorId: ator.adminId,
          acao: 'COLABORADOR_ALTERADO',
          entidade: 'colaborador',
          entidadeId: params.id,
          payload: { acaoEspecifica: 'CONTA_DESBLOQUEADA' },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        });

        return tentativas;
      });

      const tentativasSerializadas: TentativaRecente[] = tentativasRecentes.map((t) => ({
        ip: t.ip,
        criadoEm: t.criadoEm.toISOString(),
        motivo: t.motivo,
      }));

      return { id: params.id, bloqueado: false, tentativasRecentes: tentativasSerializadas };
    },
  });
}
