/**
 * API-ADM-PLA-003 — `PATCH /api/admin/plantoes/:id`
 * API-ADM-PLA-004 — `DELETE /api/admin/plantoes/:id`
 * `specs/04-api/admin-plantoes/API-ADM-PLA-003-atualizar.md`,
 * `specs/04-api/admin-plantoes/API-ADM-PLA-004-remover.md`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { emTransacao } from '@/server/db/tx';
import { obterPrisma } from '@/server/db/cliente';
import { HORA_REGEX } from '@/server/plantoes/util';
import { atualizarPlantao } from '@/server/plantoes/atualizar';
import { removerPlantao } from '@/server/plantoes/remover';

const ParamsSchema = z.object({ id: z.string().uuid() });

const AtualizarPlantaoSchema = z.object({
  vagasTotais: z.number().int().positive().optional(),
  horaInicio: z.string().regex(HORA_REGEX, 'Hora deve estar no formato HH:MM.').optional(),
  horaFim: z.string().regex(HORA_REGEX, 'Hora deve estar no formato HH:MM.').optional(),
  permiteCruzada: z.boolean().nullable().optional(),
  observacao: z.string().optional(),
  confirmarImpacto: z.boolean().optional(),
});

export const PATCH = defineHandler({
  ator: 'ADMIN',
  // Ver `../route.ts`: nenhum `EscopoRateLimit` tabelado cobre mutação admin.
  params: ParamsSchema,
  body: AtualizarPlantaoSchema,
  handler: async ({ ator, body, params, ctx }) => {
    const prisma = await obterPrisma();
    return emTransacao(prisma, (tx) =>
      atualizarPlantao(tx, params.id, body, {
        atorId: ator.adminId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      }),
    );
  },
});

const RemoverPlantaoSchema = z.object({
  confirmarCancelamentos: z.boolean().optional(),
  motivo: z.string().optional(),
});

export const DELETE = defineHandler({
  ator: 'ADMIN',
  params: ParamsSchema,
  body: RemoverPlantaoSchema,
  handler: async ({ ator, body, params, ctx }) => {
    const prisma = await obterPrisma();
    return emTransacao(prisma, (tx) =>
      removerPlantao(tx, params.id, body, {
        atorId: ator.adminId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      }),
    );
  },
});
