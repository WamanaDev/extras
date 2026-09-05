/**
 * API-ADM-COL-005 — `POST /api/admin/colaboradores/buscar` (por matrícula)
 *
 * `POST`, mesmo padrão de mutação usado no resto da API admin — mesmo sem
 * mais nenhum dado sensível em trânsito (CPF foi removido do sistema; a
 * busca agora é por matrícula, que já é exibida livremente em listagens).
 * Sem `rateLimit` explícito: mesma lacuna documentada quando a rota nasceu
 * — `EscopoRateLimit` (`src/server/http/rate-limit.ts`) não tem nenhum
 * escopo nomeado para "busca de admin"; ver `_conflitos.md`.
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { defineHandler } from '@/server/http/handler';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { obterPrisma } from '@/server/services/colaboradores';

const BuscarSchema = z.object({ matricula: z.string().trim().min(1, 'Matrícula é obrigatória.') }).strict();

function criarHandlerBuscar(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    body: BuscarSchema,
    cache: 'mutacao',
    handler: async ({ body, ator, ctx }) => {
      const candidato = await prisma.colaborador.findFirst({
        where: { matricula: body.matricula },
        select: { id: true, nome: true, matricula: true, rt: { select: { id: true, nome: true } } },
      });

      const encontrado = candidato
        ? { id: candidato.id, nome: candidato.nome, matricula: candidato.matricula, rt: candidato.rt }
        : null;

      await emTransacao(prisma, async (tx) => {
        await registrarAuditoria(tx, {
          atorTipo: 'ADMIN',
          atorId: ator.adminId,
          acao: 'AUDITORIA_CONSULTADA',
          entidade: 'colaborador',
          entidadeId: encontrado?.id ?? null,
          // `BUSCA_POR_MATRICULA` (não existe no catálogo fechado
          // `AcaoAuditoria`) — mesmo raciocínio de `importar/route.ts` e
          // `_conflitos.md`.
          payload: { acaoEspecifica: 'BUSCA_POR_MATRICULA', encontrado: encontrado !== null },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        });
      });

      return { colaborador: encontrado };
    },
  });
}

export const POST = criarHandlerBuscar(obterPrisma());
