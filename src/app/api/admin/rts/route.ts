/**
 * `GET /api/admin/rts` — lista de RTs ativas, para preencher seletores
 * (ex.: criar colaborador, criar plantão).
 *
 * Não tem ID de spec — `04-api/*` nunca definiu uma rota dedicada pra RTs,
 * mas `contrato-comum.md`, tabela "Cache", já lista "Referência (RTs,
 * códigos) → private, max-age=300" como categoria esperada, então isso é
 * completar um contrato já anunciado, não inventar um novo. Gap achado ao
 * tentar cadastrar um colaborador de verdade pela primeira vez: o formulário
 * não tinha de onde vir o `rtId` (UUID) — usuário tentando digitar "1" à mão
 * sempre falhava com 422. Ver `_conflitos.md`.
 */
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/services/colaboradores';

export const GET = defineHandler({
  ator: 'ADMIN',
  cache: 'referencia',
  handler: async () => {
    const prisma = obterPrisma();
    const rts = await prisma.rt.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    });
    return { itens: rts };
  },
});
