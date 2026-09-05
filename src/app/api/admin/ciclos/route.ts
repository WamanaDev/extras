/**
 * `GET /api/admin/ciclos` (API-ADM-CIC-001) e `POST /api/admin/ciclos`
 * (API-ADM-CIC-002). Wiring fino sobre `src/server/ciclos/{listar,criar}.ts`
 * — a lógica testável vive lá; aqui só `defineHandler` + schemas.
 */
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/ciclos/compartilhado';
import { ListarCiclosQuerySchema, listarCiclos, type ListarCiclosQuery } from '@/server/ciclos/listar';
import { CriarCicloBodySchema, criarCiclo } from '@/server/ciclos/criar';

export const GET = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  query: ListarCiclosQuerySchema,
  paginacao: true,
  cache: 'pessoal',
  // `paginacao: true` faz `defineHandler` mesclar `pagina`/`tamanho` ao
  // `query` em tempo de execução (`mesclarComPaginacao`, `handler.ts`), mas
  // o tipo de `TQuery` inferido pelo `ConfigHandler` vem só do schema
  // declarado aqui (`ListarCiclosQuerySchema`, sem `pagina`/`tamanho`) — gap
  // de tipo do próprio `handler.ts` (mesma causa quebra `tsc` em
  // `admin/colaboradores` e `admin/marcacoes`, que usam a mesma combinação
  // `query` + `paginacao: true`). Cast local e documentado: o valor em
  // runtime sempre tem `pagina`/`tamanho` quando `paginacao: true` está
  // ativo — não é um `any`, só alarga um tipo comprovadamente incompleto.
  // Ver `_conflitos.md` item 13.
  handler: async ({ query }) => listarCiclos(obterPrisma(), query as unknown as ListarCiclosQuery),
});

export const POST = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  body: CriarCicloBodySchema,
  statusSucesso: 201,
  handler: async ({ body, ator, ctx }) => criarCiclo(obterPrisma(), body, ator, ctx),
});
