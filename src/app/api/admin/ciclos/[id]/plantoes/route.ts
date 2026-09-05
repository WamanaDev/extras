/**
 * `GET /api/admin/ciclos/:id/plantoes` — lista de plantões do ciclo, para
 * preencher seletores (editar/remover plantão, marcar/cancelar extra como
 * admin).
 *
 * `specs/04-api/admin-plantoes/` e `admin-marcacoes/` só definem `POST`
 * (criar) e `PATCH`/`DELETE` por id — nenhuma spec cobre "listar plantões de
 * um ciclo", então os campos de plantão nessas telas eram texto livre
 * pedindo pra digitar um UUID. Mesma família de gap que `/api/admin/rts` e
 * `/api/admin/codigos-escala` (ver `_conflitos.md`).
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/services/colaboradores';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const GET = defineHandler({
  ator: 'ADMIN',
  params: ParamsSchema,
  cache: 'pessoal',
  handler: async ({ params }) => {
    const prisma = obterPrisma();
    const plantoes = await prisma.plantao.findMany({
      where: { cicloId: params.id, ativo: true },
      orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
      select: {
        id: true,
        data: true,
        tipo: true,
        vagasTotais: true,
        vagasOcupadas: true,
        rtId: true,
        rt: { select: { nome: true } },
      },
    });
    return {
      itens: plantoes.map((p) => ({
        id: p.id,
        data: p.data.toISOString().slice(0, 10),
        tipo: p.tipo,
        rtId: p.rtId,
        rtNome: p.rt.nome,
        vagasTotais: p.vagasTotais,
        vagasOcupadas: p.vagasOcupadas,
      })),
    };
  },
});
