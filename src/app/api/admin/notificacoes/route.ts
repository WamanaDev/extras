/**
 * `POST /api/admin/notificacoes` — admin envia uma notificação manual
 * (in-app + tentativa de push best-effort) para um ou mais colaboradores.
 *
 * Não é gatilho de negócio (nenhuma extra/escala envolvida) — é um envio
 * livre, texto escolhido pelo admin na hora. Reaproveita `criarNotificacao`
 * (mesmo ponto de entrada que qualquer feature futura vai usar) via
 * `enviarNotificacaoEmLote`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { erroDeValidacao } from '@/server/http/erros';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { obterPrisma } from '@/server/services/colaboradores';
import { enviarNotificacaoEmLote } from '@/server/notificacoes/enviar-em-lote';

const BodySchema = z.object({
  colaboradorIds: z.array(z.string().uuid()).min(1, 'Selecione ao menos um colaborador.'),
  titulo: z.string().trim().min(1, 'Título é obrigatório.').max(200),
  mensagem: z.string().trim().min(1, 'Mensagem é obrigatória.').max(2000),
  link: z.string().trim().min(1).optional(),
});

export const POST = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  body: BodySchema,
  cache: 'mutacao',
  handler: async ({ body, ator, ctx }) => {
    const prisma = await obterPrisma();

    const resultado = await enviarNotificacaoEmLote(prisma, {
      colaboradorIds: body.colaboradorIds,
      titulo: body.titulo,
      mensagem: body.mensagem,
      ...(body.link !== undefined ? { link: body.link } : {}),
    });

    if (resultado.enviadas === 0) {
      throw erroDeValidacao({ colaboradorIds: 'Nenhum dos colaboradores selecionados existe.' });
    }

    await emTransacao(prisma, (tx) =>
      registrarAuditoria(tx, {
        atorTipo: 'ADMIN',
        atorId: ator.adminId,
        acao: 'NOTIFICACAO_ENVIADA',
        entidade: 'colaborador',
        entidadeId: null,
        payload: { colaboradorIds: resultado.colaboradorIds, titulo: body.titulo },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      }),
    );

    return resultado;
  },
});
