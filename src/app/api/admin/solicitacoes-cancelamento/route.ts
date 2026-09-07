/**
 * `GET /api/admin/solicitacoes-cancelamento` — pedido do usuário, sem spec de
 * API própria ainda (ver `_conflitos.md`): lista os pedidos de cancelamento
 * de extra abertos por colaboradores, pra qualquer admin revisar.
 *
 * Wiring de `defineHandler` sobre
 * `@/server/services/solicitacoes-cancelamento` — nenhuma regra aqui, só
 * validação de query e paginação.
 */
import { z, type ZodSchema } from 'zod';
import { defineHandler, paginacaoQuerySchema } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { listarSolicitacoesCancelamento } from '@/server/services/solicitacoes-cancelamento';

const ListarQuerySchema = z
  .object({
    status: z.enum(['PENDENTE', 'APROVADA', 'RECUSADA']).optional(),
  })
  .merge(paginacaoQuerySchema);

export const GET = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'leitura_por_sessao' },
  // Cast: mesmo motivo de `admin/marcacoes/route.ts` (`_conflitos.md`, item
  // 13) — `paginacao: true` mescla `paginacaoQuerySchema` (`.default()`),
  // Input diverge de Output.
  query: ListarQuerySchema as unknown as ZodSchema<z.infer<typeof ListarQuerySchema>>,
  paginacao: true,
  cache: 'pessoal',
  handler: async ({ query }) => {
    const prisma = await obterPrisma();
    return listarSolicitacoesCancelamento(prisma, {
      status: query.status,
      pagina: query.pagina,
      tamanho: query.tamanho,
    });
  },
});
