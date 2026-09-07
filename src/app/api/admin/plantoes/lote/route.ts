/**
 * API-ADM-PLA-002 — `POST /api/admin/plantoes/lote`.
 * `specs/04-api/admin-plantoes/API-ADM-PLA-002-lote.md`.
 */
import { z, type ZodSchema } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { emTransacao } from '@/server/db/tx';
import { obterPrisma } from '@/server/db/cliente';
import { gerarLotePlantoes } from '@/server/plantoes/lote';

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const dataSchema = z
  .string()
  .regex(DATA_REGEX, 'Data deve estar no formato AAAA-MM-DD.')
  .transform((valor) => new Date(`${valor}T00:00:00.000Z`));

const LoteSchema = z
  .object({
    cicloId: z.string().uuid(),
    rtIds: z.array(z.string().uuid()).min(1),
    de: dataSchema,
    ate: dataSchema,
    tipos: z.array(z.enum(['DIURNO', 'NOTURNO'])).min(1),
    vagasTotais: z.number().int().positive(),
    diasSemana: z.array(z.number().int().min(0).max(6)).optional(),
    paridade: z.enum(['PAR', 'IMPAR', 'AMBOS']).optional(),
    permiteCruzada: z.boolean().nullable().default(null),
    preview: z.boolean().optional().default(false),
  })
  .refine((v) => v.de.getTime() <= v.ate.getTime(), { message: '"de" deve ser anterior ou igual a "ate".', path: ['de'] });

export const POST = defineHandler({
  ator: 'ADMIN',
  // Ver route.ts de API-ADM-PLA-001: nenhum `EscopoRateLimit` tabelado cobre
  // mutação administrativa — `rateLimit` omitido de propósito.
  //
  // Cast: mesma classe de erro de `../route.ts` (`_conflitos.md`, item 13) —
  // `de`/`ate` têm `.transform()` e `permiteCruzada`/`preview` têm
  // `.default()`, então Input diverge de Output em vários campos e a
  // atribuição direta a `ZodSchema<TBody>` (`Input === Output` por padrão)
  // falha sob `exactOptionalPropertyTypes`. Sem efeito em runtime.
  body: LoteSchema as unknown as ZodSchema<z.infer<typeof LoteSchema>>,
  handler: async ({ ator, body, ctx }) => {
    const prisma = await obterPrisma();
    return emTransacao(prisma, (tx) =>
      gerarLotePlantoes(tx, body, {
        atorId: ator.adminId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      }),
    );
  },
});
