/**
 * API-ADM-REL-003 — `GET /api/admin/auditoria`.
 *
 * Wiring de `defineHandler` sobre `consultarAuditoria`
 * (`@/server/relatorios/auditoria.ts`) — filtra, pagina, valida integridade
 * por linha e audita `AUDITORIA_CONSULTADA` (AUD-7).
 *
 * ## Corpo `{ eventos }` + `X-Total-Count`, sem `paginacao: true`
 * O contrato da spec fixa o corpo de sucesso como `{ eventos: [...] }` — não
 * o envelope genérico `{ itens, total }` que `paginacao: true` produziria
 * (que serializaria um array solto, não `{ eventos }`). `pagina`/`tamanho`
 * ainda são aceitos e validados via `paginacaoQuerySchema` (mesclado no
 * schema de query, `contrato-comum.md`, "Paginação" — obrigatória em lista
 * administrativa), mas a resposta é montada à mão como `NextResponse` e
 * devolvida direto do `handler` — o mesmo ramo de passagem direta do
 * pipeline citado em `handler.ts` e usado por
 * `.../ciclo/[id]/export/route.ts`. `X-Total-Count` é setado manualmente
 * aqui pelo mesmo motivo.
 */
import { z, type ZodSchema } from 'zod';
import { NextResponse } from 'next/server';
import { defineHandler, paginacaoQuerySchema } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { consultarAuditoria } from '@/server/relatorios/auditoria';

const QuerySchema = z
  .object({
    entidade: z.string().trim().min(1).optional(),
    entidadeId: z.string().uuid().optional(),
    atorId: z.string().uuid().optional(),
    acao: z.string().trim().min(1).optional(),
    de: z.coerce.date().optional(),
    ate: z.coerce.date().optional(),
  })
  .merge(paginacaoQuerySchema);

type QuerySaida = z.infer<typeof QuerySchema>;

export const GET = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'leitura_por_sessao' },
  // `pagina`/`tamanho` (de `paginacaoQuerySchema`) têm `.default()` — Input
  // opcional, Output obrigatório. `defineHandler` tipa `query?: ZodSchema<TQuery>`
  // (`Input = Output = TQuery` por padrão), então nenhuma atribuição direta
  // satisfaz `exactOptionalPropertyTypes`. Mesmo cast já usado em
  // `admin/marcacoes/route.ts` — ver `_conflitos.md`, item 13.
  query: QuerySchema as unknown as ZodSchema<QuerySaida>,
  cache: 'pessoal',
  handler: async ({ ator, query, ctx }) => {
    const prisma = await obterPrisma();
    const resultado = await consultarAuditoria(
      prisma,
      {
        entidade: query.entidade,
        entidadeId: query.entidadeId,
        atorId: query.atorId,
        acao: query.acao,
        de: query.de,
        ate: query.ate,
        pagina: query.pagina,
        tamanho: query.tamanho,
      },
      {
        atorId: ator.adminId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      },
    );

    const response = NextResponse.json({ eventos: resultado.eventos });
    response.headers.set('X-Total-Count', String(resultado.total));
    return response;
  },
});
