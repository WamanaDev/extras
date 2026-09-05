/**
 * API-ADM-REL-004 — `GET /api/admin/seguranca/tentativas`.
 *
 * Wiring de `defineHandler` sobre `montarPainelSeguranca`
 * (`@/server/relatorios/seguranca.ts`). Sem `pagina`/`tamanho`: o contrato da
 * spec (`?janela=24h|7d&apenasSuspeitas=true`) não inclui paginação — as
 * listas retornadas (contas bloqueadas, IPs suspeitos) são por natureza
 * limitadas ao que passa nos limiares da regra, não uma listagem geral
 * (diferente de `API-ADM-REL-003`, que pagina toda a trilha de auditoria).
 */
import { z, type ZodSchema } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { montarPainelSeguranca } from '@/server/relatorios/seguranca';

const QuerySchema = z.object({
  janela: z.enum(['24h', '7d']).default('24h'),
  apenasSuspeitas: z
    .enum(['true', 'false'])
    .optional()
    .transform((valor) => valor === 'true'),
});

type QuerySaida = z.infer<typeof QuerySchema>;

export const GET = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'leitura_por_sessao' },
  // `janela` tem `.default()` e `apenasSuspeitas` tem `.transform()` — Input
  // diverge de Output nos dois campos, mesma classe de erro sob
  // `exactOptionalPropertyTypes` já documentada em `admin/marcacoes/route.ts`
  // e `_conflitos.md`, item 13. Mesmo cast, mesma causa.
  query: QuerySchema as unknown as ZodSchema<QuerySaida>,
  cache: 'pessoal',
  handler: async ({ query, ctx }) => {
    const prisma = await obterPrisma();
    return montarPainelSeguranca(prisma, ctx.agora, {
      janela: query.janela,
      apenasSuspeitas: query.apenasSuspeitas ?? false,
    });
  },
});
