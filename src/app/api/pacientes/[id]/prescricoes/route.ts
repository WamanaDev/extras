/**
 * API-MED-001 (`GET`) / API-MED-002 (`POST`) — `/api/pacientes/:id/prescricoes`.
 * Ator colaborador (qualquer um da RT do paciente) — RNP-13. Parâmetro `id`
 * (não `pacienteId`) — Next.js exige o mesmo nome de slug em toda rota
 * dinâmica irmã sob `api/pacientes/*` (`[id]` já usado por
 * `GET /api/pacientes/:id`).
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { listarPrescricoes, criarPrescricao } from '@/server/services/pacientes/medicamentos';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';
import { erroNaoEncontrado } from '@/server/http/erros';

const ParamsSchema = z.object({ id: z.string().uuid() });
const ListarQuerySchema = z.object({ status: z.enum(['ATIVA', 'SUSPENSA', 'ENCERRADA']).optional() });

export const GET = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: { escopo: 'leitura_por_sessao' },
  params: ParamsSchema,
  query: ListarQuerySchema,
  cache: 'pessoal',
  handler: async ({ params, query, ator }) => {
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    return listarPrescricoes(prisma, params.id, rtId, query.status);
  },
});

const CriarSchema = z
  .object({
    medicamentoId: z.string().uuid(),
    tipo: z.enum(['REGULAR', 'PRN']),
    duracao: z.enum(['DEFINITIVA', 'TEMPORARIA']),
    dose: z.string().trim().min(1),
    via: z.string().trim().min(1),
    horarios: z.array(z.string().regex(/^\d{2}:\d{2}$/)).optional(),
    dataInicio: z.string().date(),
    dataFim: z.string().date().optional(),
    prescritoPor: z.string().trim().min(1),
    instrucoes: z.string().trim().optional(),
  })
  .strict();

export const POST = defineHandler({
  // RNP-13: qualquer colaborador da RT do paciente registra a receita;
  // admin também pode (correção/cobertura administrativa) — por isso
  // 'QUALQUER', não só 'COLABORADOR'.
  ator: 'QUALQUER',
  params: ParamsSchema,
  body: CriarSchema,
  statusSucesso: 201,
  handler: async ({ params, body, ator, ctx }) => {
    const prisma = await obterPrisma();
    if (ator.tipo === 'COLABORADOR') {
      const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
      return criarPrescricao(prisma, params.id, rtId, body, { colaboradorId: ator.colaboradorId }, ctx);
    }
    // Admin: sem escopo de RT — pode registrar para paciente de qualquer unidade.
    const paciente = await prisma.paciente.findUnique({ where: { id: params.id }, select: { rtId: true } });
    if (!paciente) throw erroNaoEncontrado('Paciente não encontrado.');
    return criarPrescricao(prisma, params.id, paciente.rtId, body, { adminId: ator.adminId }, ctx);
  },
});
