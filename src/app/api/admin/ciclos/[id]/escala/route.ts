/**
 * `API-ADM-ESC-001` — `GET /api/admin/ciclos/:id/escala`.
 *
 * Grade completa colaboradores × dias — base da tela de edição e da
 * impressão (`API-ADM-ESC-004` reaproveita `buscarGrade`, abaixo).
 *
 * Uma única transação de leitura (`ACID`, "Grade e cobertura precisam ser do
 * mesmo instante") — todas as consultas rodam dentro de `emTransacao`, mesmo
 * sendo só leitura, para que a grade e a cobertura de `FN-009` não se
 * refiram a instantes diferentes.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { erroNaoEncontrado } from '@/server/http/erros';
import { obterPrisma } from '@/server/db/client';
import { emTransacao } from '@/server/db/tx';
import { buscarGrade } from '@/server/services/escala-admin/consulta';

const ParamsSchema = z.object({ id: z.string().uuid() });
const QuerySchema = z.object({
  rt: z.string().uuid().optional(),
  turno: z.enum(['DIURNO', 'NOTURNO']).optional(),
});

export const GET = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  params: ParamsSchema,
  query: QuerySchema,
  // `pessoal`: a grade carrega `observacao` (saúde) para o admin — nunca cache compartilhado (contrato-comum.md, tabela "Cache").
  cache: 'pessoal',
  handler: async ({ params, query }) => {
    const prisma = await obterPrisma();
    const filtro = { ...(query.rt !== undefined ? { rt: query.rt } : {}), ...(query.turno !== undefined ? { turno: query.turno } : {}) };
    const grade = await emTransacao(prisma, (tx) => buscarGrade(tx, params.id, filtro));
    if (!grade) throw erroNaoEncontrado('Ciclo não encontrado.');
    return grade;
  },
});
