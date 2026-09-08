/**
 * `GET /api/colaborador/rt` — a RT do colaborador da sessão. Gap não coberto
 * por `API-AUTH-005-me.md` (que devolve `rt.nome`, não o `id` — ver
 * `src/server/auth/me.ts`); o módulo de pacientes precisa do `id` para
 * assinar o canal `rt:{rtId}:pacientes` (RT-003) no cliente. Extensão
 * aditiva mínima, mesmo racional de `obterRtDoColaborador`
 * (`services/pacientes/contexto.ts`), só exposta como rota.
 */
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';

export const GET = defineHandler({
  ator: 'COLABORADOR',
  cache: 'pessoal',
  handler: async ({ ator }) => {
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    return { rtId };
  },
});
