/**
 * `API-ADM-PAR-001` — `PUT /api/admin/ciclos/:id/participacoes/:colaboradorId`.
 *
 * Entregável de `specs/04-api/admin-participacoes/API-ADM-PAR-001-definir.md`.
 * Adaptador fino: valida/autentica via `defineHandler` (`API-000`), abre a
 * transação (`emTransacao`) e delega toda a regra de negócio a
 * `src/server/participacoes/definir.ts` através da porta
 * `adaptarPrisma` (`src/server/participacoes/adaptador-prisma.ts`).
 *
 * Broadcast `ciclo:atualizado` (passo 5 do fluxo) só depois da transação
 * commitada (`SEC-ACID`) — ver `src/server/participacoes/broadcast.ts` sobre
 * por que é um no-op até `RT-001` existir.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/cliente';
import { emTransacao } from '@/server/db/tx';
import { adaptarPrisma } from '@/server/participacoes/adaptador-prisma';
import { definirParticipacao } from '@/server/participacoes/definir';
import { emitirCicloAtualizado } from '@/server/participacoes/broadcast';

const ParamsSchema = z.object({
  id: z.string().uuid(),
  colaboradorId: z.string().uuid(),
});

const CorpoSchema = z.object({
  limiteOverride: z.number().int().min(0).nullable().optional(),
  permiteCruzada: z.boolean().nullable().optional(),
  bloqueado: z.boolean().optional(),
  motivo: z.string().trim().min(1).max(200).optional(),
  confirmarImpacto: z.boolean().optional(),
});

export const PUT = defineHandler({
  ator: 'ADMIN',
  params: ParamsSchema,
  body: CorpoSchema,
  handler: async ({ ator, params, body, ctx }) => {
    const prisma = await obterPrisma();

    const resultado = await emTransacao(prisma, async (tx) => {
      const porta = adaptarPrisma(tx);
      return definirParticipacao(porta, {
        cicloId: params.id,
        colaboradorId: params.colaboradorId,
        atorTipo: 'ADMIN',
        atorId: ator.adminId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        body,
      });
    });

    const campos = camposAlterados(body);
    if (campos.length > 0) {
      await emitirCicloAtualizado({ cicloId: params.id, campos });
    }

    return resultado;
  },
});

function camposAlterados(body: z.infer<typeof CorpoSchema>): string[] {
  const campos: string[] = [];
  if (body.limiteOverride !== undefined) campos.push('limiteOverride');
  if (body.permiteCruzada !== undefined) campos.push('permiteCruzada');
  if (body.bloqueado !== undefined) campos.push('bloqueado');
  return campos;
}
