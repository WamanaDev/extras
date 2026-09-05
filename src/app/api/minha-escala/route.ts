/**
 * API-COL-002 — `GET /api/minha-escala?cicloId=`.
 *
 * `colaboradorId` **nunca** vem de query string, mesmo que o cliente envie
 * um — o schema de query abaixo só declara `cicloId`; qualquer outro campo
 * é ignorado pelo `safeParse` do Zod (teste #5 da spec: "`?colaboradorId=`
 * de terceiro | ignorado, retorna a própria"). O `colaboradorId` real vem
 * exclusivamente de `ator.colaboradorId` (sessão).
 */
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { buscarMinhaEscala } from '@/server/services/colaborador/minha-escala';

let prisma: PrismaClient | null = null;
function obterPrisma(): PrismaClient {
  prisma ??= new PrismaClient();
  return prisma;
}

const QuerySchema = z.object({
  cicloId: z.string().uuid(),
});

export const GET = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: {
    escopo: 'leitura_por_sessao',
    identificador: ({ request }) => request.cookies.get('sessao_colaborador')?.value ?? 'anon',
  },
  query: QuerySchema,
  cache: 'pessoal', // CIA — C: `private, no-store`.
  handler: async ({ ator, query }) => {
    return buscarMinhaEscala(obterPrisma(), ator.colaboradorId, query.cicloId);
  },
});
