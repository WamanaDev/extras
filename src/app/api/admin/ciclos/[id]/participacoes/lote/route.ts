/**
 * `API-ADM-PAR-002` — `POST /api/admin/ciclos/:id/participacoes/lote`.
 *
 * Entregável de `specs/04-api/admin-participacoes/API-ADM-PAR-002-lote.md`.
 * Mesmo padrão de adaptador fino de `../[colaboradorId]/route.ts`: a regra de
 * negócio vive em `src/server/participacoes/lote.ts`.
 *
 * `filtro` exige ao menos um critério (`rtId`, `turno` ou `colaboradorIds`) —
 * validado aqui via `.refine`, antes de qualquer acesso a dado (`422`, não
 * `409`: é forma do payload, não regra de negócio). Teto de 200 colaboradores
 * por chamada é reforçado duas vezes: aqui (lista explícita, resposta rápida
 * sem tocar o banco) e em `aplicarParticipacaoEmLote` (depois de resolver
 * `rtId`/`turno`, que só o banco sabe quantos colaboradores batem).
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/cliente';
import { emTransacao } from '@/server/db/tx';
import { adaptarPrisma } from '@/server/participacoes/adaptador-prisma';
import { aplicarParticipacaoEmLote, TETO_LOTE } from '@/server/participacoes/lote';
import { emitirCicloAtualizado } from '@/server/participacoes/broadcast';

const ParamsSchema = z.object({ id: z.string().uuid() });

const FiltroSchema = z
  .object({
    rtId: z.string().uuid().optional(),
    turno: z.enum(['DIURNO', 'NOTURNO']).optional(),
    colaboradorIds: z.array(z.string().uuid()).min(1).max(TETO_LOTE).optional(),
  })
  .refine((filtro) => Boolean(filtro.rtId || filtro.turno || filtro.colaboradorIds), {
    message: 'Informe ao menos um critério: rtId, turno ou colaboradorIds.',
  });

const CorpoSchema = z.object({
  filtro: FiltroSchema,
  limiteOverride: z.number().int().min(0).nullable().optional(),
  permiteCruzada: z.boolean().nullable().optional(),
  motivo: z.string().trim().min(1).max(200),
  preview: z.boolean().optional(),
  confirmarImpacto: z.boolean().optional(),
});

export const POST = defineHandler({
  ator: 'ADMIN',
  params: ParamsSchema,
  body: CorpoSchema,
  handler: async ({ ator, params, body, ctx }) => {
    const prisma = await obterPrisma();

    // `preview` não precisa de transação de escrita, mas roda pela mesma
    // função de negócio (que só grava depois do gate de preview) para nunca
    // duplicar a lógica de resolução de filtro/impacto entre os dois modos.
    const resultado = await emTransacao(prisma, async (tx) => {
      const porta = adaptarPrisma(tx);
      return aplicarParticipacaoEmLote(porta, {
        cicloId: params.id,
        atorTipo: 'ADMIN',
        atorId: ator.adminId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        body,
      });
    });

    if (body.preview !== true && resultado.afetados > 0) {
      const campos = [
        ...(body.limiteOverride !== undefined ? ['limiteOverride'] : []),
        ...(body.permiteCruzada !== undefined ? ['permiteCruzada'] : []),
      ];
      if (campos.length > 0) {
        await emitirCicloAtualizado({ cicloId: params.id, campos });
      }
    }

    return resultado;
  },
});
