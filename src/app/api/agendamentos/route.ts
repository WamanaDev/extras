/**
 * API-AGE-001 (`GET`) / API-AGE-002 (`POST`) — `/api/agendamentos`.
 * Sempre escopado à RT do colaborador da sessão (RNP-01).
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { agendaRt, criarAgendamento } from '@/server/services/pacientes/agendamentos';
import { obterRtDoColaborador } from '@/server/services/pacientes/contexto';
import { erroDeNegocio, erroNaoEncontrado } from '@/server/http/erros';
import { broadcastPacientes } from '@/server/realtime/broadcast-pacientes';

const ListarQuerySchema = z.object({
  de: z.string().date(),
  ate: z.string().date(),
  tipo: z.enum(['CONSULTA', 'SAIDA']).optional(),
});

function diasEntre(de: string, ate: string): number {
  return Math.round((new Date(`${ate}T00:00:00Z`).getTime() - new Date(`${de}T00:00:00Z`).getTime()) / 86_400_000);
}

export const GET = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: { escopo: 'leitura_por_sessao' },
  query: ListarQuerySchema,
  cache: 'pessoal',
  handler: async ({ query, ator }) => {
    if (diasEntre(query.de, query.ate) > 92 || diasEntre(query.de, query.ate) < 0) {
      throw erroDeNegocio('Período inválido — use um intervalo de até 92 dias.', 'INTERVALO_INVALIDO');
    }
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    const itens = await agendaRt(prisma, rtId, query.de, query.ate);
    return query.tipo ? itens.filter((i) => i.tipo === query.tipo) : itens;
  },
});

const CriarSchema = z
  .object({
    pacienteId: z.string().uuid(),
    tipo: z.enum(['CONSULTA', 'SAIDA']),
    titulo: z.string().trim().min(1),
    local: z.string().trim().optional(),
    inicioEm: z.string().datetime({ offset: true }),
    fimEm: z.string().datetime({ offset: true }),
    acompanhanteColaboradorId: z.string().uuid().optional(),
    observacoes: z.string().trim().optional(),
  })
  .strict();

export const POST = defineHandler({
  ator: 'COLABORADOR',
  body: CriarSchema,
  statusSucesso: 201,
  handler: async ({ body, ator, ctx }) => {
    const prisma = await obterPrisma();
    const rtId = await obterRtDoColaborador(prisma, ator.colaboradorId);
    const alvo = await prisma.paciente.findFirst({ where: { id: body.pacienteId, rtId } });
    if (!alvo) throw erroNaoEncontrado('Paciente não encontrado.');

    const agendamento = await criarAgendamento(prisma, body, { colaboradorId: ator.colaboradorId }, ctx);

    // Depois do commit (RT-003, SEC-ACID) — nunca antes.
    await broadcastPacientes(rtId, 'agendamento:criado', { agendamentoId: agendamento.id, pacienteId: agendamento.pacienteId, tipo: agendamento.tipo, inicioEm: agendamento.inicioEm });

    return agendamento;
  },
});
