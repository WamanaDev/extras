/**
 * `GET /api/ciclos/vizinhos?ano=&mes=` — pedido do usuário, sem spec de API
 * própria ainda (ver `_conflitos.md`): navegação de mês em
 * `/plantoes-calendario`/`/minha-escala-calendario`, sempre 1 chamada por
 * passo de navegação (o cliente já tem o vizinho em cache do passo
 * anterior — troca a tela na hora e só confirma/completa a janela aqui).
 *
 * Lógica em `@/server/services/colaborador/ciclos-vizinhos` (testável sem
 * Postgres real) — este arquivo só faz a fiação exigida pelo pipeline de
 * `defineHandler`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { buscarVizinhosCiclos } from '@/server/services/colaborador/ciclos-vizinhos';

const QuerySchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2200),
  mes: z.coerce.number().int().min(1).max(12),
});

export const GET = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: {
    escopo: 'leitura_por_sessao',
    identificador: ({ request }) => request.cookies.get('sessao_colaborador')?.value ?? 'anon',
  },
  query: QuerySchema,
  cache: 'grade-extras', // Mesma política de `/api/ciclos/atual` (`private, max-age=5`).
  handler: async ({ query, ctx }) => {
    const prisma = await obterPrisma();
    return buscarVizinhosCiclos(prisma, query.ano, query.mes, ctx.agora);
  },
});
