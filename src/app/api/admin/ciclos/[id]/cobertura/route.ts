/** `GET /api/admin/ciclos/:id/cobertura` (API-ADM-CIC-008). */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/ciclos/compartilhado';
import { CoberturaQuerySchema, obterCobertura, type CoberturaQuery } from '@/server/ciclos/cobertura';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const GET = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  // `CoberturaQuerySchema` usa `.transform` (`"true"|"false"|undefined` →
  // `boolean`): entrada e saída divergem, mas `ConfigHandler['query']` exige
  // `ZodSchema<TQuery>` (entrada === saída === TQuery) — mesmo gap de tipo
  // de `handler.ts` do item acima (`route.ts` da listagem), aqui na forma
  // de um `.transform` em vez de paginação. Cast local documentado, mesma
  // razão: o valor validado em runtime é sempre `{ apenasDeficit: boolean }`
  // (zod já roda o `.transform` de verdade). Ver `_conflitos.md` item 13.
  query: CoberturaQuerySchema as unknown as z.ZodType<CoberturaQuery>,
  params: ParamsSchema,
  // Spec pede `private, max-age=30`, mas `contrato-comum.md` (API-000,
  // rígido) só tabela `mutacao`/`pessoal`/`grade-extras` (max-age=5)/
  // `referencia` (max-age=300) — nenhum "relatório pesado" de 30s. `grade-extras`
  // é o mais próximo (curto, força reconsulta logo) sem inventar um novo
  // `TipoCache` no arquivo rígido — ver `_conflitos.md` item 12.
  cache: 'grade-extras',
  handler: async ({ params, query }) => obterCobertura(obterPrisma(), params.id, query),
});
