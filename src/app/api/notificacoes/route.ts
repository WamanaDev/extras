/**
 * `GET /api/notificacoes` — lista as notificações do colaborador autenticado,
 * mais recentes primeiro, paginado (`contrato-comum.md`, "Paginação").
 */
import type { ZodSchema } from 'zod';
import { defineHandler, paginacaoQuerySchema, type PaginacaoQuery } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { buscarNotificacoes } from '@/server/notificacoes/listar';

export const GET = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: {
    escopo: 'leitura_por_sessao',
    identificador: ({ request }) => request.cookies.get('sessao_colaborador')?.value ?? 'anon',
  },
  // Sem filtro próprio — `pagina`/`tamanho` de `paginacaoQuerySchema` já
  // fecham o schema de query (`contrato-comum.md`, "Paginação"). `pagina`/
  // `tamanho` têm `.default()` (entrada opcional, saída obrigatória) — mesmo
  // cast documentado em `admin/ciclos/route.ts`/`admin/marcacoes/route.ts`
  // para o mesmo gap de `ConfigHandler` (`_conflitos.md`, item 13).
  query: paginacaoQuerySchema as unknown as ZodSchema<PaginacaoQuery>,
  paginacao: true,
  cache: 'pessoal',
  handler: async ({ ator, query }) => {
    const prisma = await obterPrisma();
    return buscarNotificacoes(prisma, ator.colaboradorId, { pagina: query.pagina, tamanho: query.tamanho });
  },
});
