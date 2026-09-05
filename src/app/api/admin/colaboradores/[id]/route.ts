/**
 * API-ADM-COL-003 — `PATCH /api/admin/colaboradores/:id`
 *
 * Altera dados cadastrais/lotação/situação. Nunca altera âncora (isso é
 * `API-ADM-COL-006`, trocar-escala) — por isso o schema do corpo nem lista o
 * campo (payload com `escalaAncora` é rejeitado por `.strict()`, satisfaz o
 * teste 5 "tentar alterar âncora aqui → ignorado/422").
 *
 * `confirmarImpacto` não está no contrato literal da spec (que só lista
 * `{ nome?, rtId?, ativo?, escalaHoraInicio?, escalaHoraFim? }`), mas o
 * próprio Fluxo exige "exigir confirmação" para dois cenários (troca de RT
 * com marcações cruzadas; desativação com extras futuras) e o catálogo de
 * erro já reserva `IMPACTO_NAO_CONFIRMADO` para exatamente isso — sem um
 * campo de confirmação no corpo não haveria como o cliente jamais completar
 * o fluxo depois de ver o impacto listado. Acréscimo mínimo necessário para
 * implementar o Fluxo descrito, não invenção de regra nova.
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { defineHandler } from '@/server/http/handler';
import { erroDeNegocio, erroNaoEncontrado } from '@/server/http/erros';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { obterPrisma } from '@/server/services/colaboradores';

const ParamsSchema = z.object({ id: z.string().uuid() });

const AtualizarColaboradorSchema = z
  .object({
    nome: z.string().trim().min(1).optional(),
    rtId: z.string().uuid().optional(),
    ativo: z.boolean().optional(),
    escalaHoraInicio: z.string().optional(),
    escalaHoraFim: z.string().optional(),
    /** Ver doc-comment do módulo — confirma prosseguir apesar do impacto já reportado numa chamada anterior. */
    confirmarImpacto: z.boolean().optional(),
  })
  .strict();

function parseHoraCivil(valor: string): Date | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(valor);
  if (!m) return null;
  const [, hStr, minStr, sStr] = m;
  const h = Number(hStr);
  const min = Number(minStr);
  const s = sStr ? Number(sStr) : 0;
  if (h > 23 || min > 59 || s > 59) return null;
  return new Date(Date.UTC(1970, 0, 1, h, min, s));
}

function criarHandlerAtualizar(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    params: ParamsSchema,
    body: AtualizarColaboradorSchema,
    handler: async ({ params, body, ator, ctx }) => {
      const atual = await prisma.colaborador.findUnique({ where: { id: params.id } });
      if (!atual) throw erroNaoEncontrado('Colaborador não encontrado.');

      const impacto: { rtComMarcacoesCruzadas?: number; extrasFuturasConfirmadas?: number } = {};

      if (body.rtId !== undefined && body.rtId !== atual.rtId) {
        const cruzadas = await prisma.marcacao.count({
          where: {
            colaboradorId: params.id,
            status: 'CONFIRMADA',
            cruzada: true,
            plantao: { data: { gte: ctx.agora }, ciclo: { status: { not: 'FECHADO' } } },
          },
        });
        if (cruzadas > 0) impacto.rtComMarcacoesCruzadas = cruzadas;
      }

      if (body.ativo === false && atual.ativo === true) {
        const extrasFuturas = await prisma.marcacao.count({
          where: {
            colaboradorId: params.id,
            status: 'CONFIRMADA',
            plantao: { data: { gte: ctx.agora }, ciclo: { status: { not: 'FECHADO' } } },
          },
        });
        if (extrasFuturas > 0) impacto.extrasFuturasConfirmadas = extrasFuturas;
      }

      const temImpacto = impacto.rtComMarcacoesCruzadas !== undefined || impacto.extrasFuturasConfirmadas !== undefined;
      if (temImpacto && body.confirmarImpacto !== true) {
        throw erroDeNegocio('Esta alteração afeta marcações existentes. Confirme para prosseguir.', 'IMPACTO_NAO_CONFIRMADO');
      }

      let escalaHoraInicio: Date | null | undefined;
      if (body.escalaHoraInicio !== undefined) {
        escalaHoraInicio = parseHoraCivil(body.escalaHoraInicio);
        if (!escalaHoraInicio) throw erroDeNegocio('Hora de início inválida.', 'REGRA_DE_NEGOCIO');
      }
      let escalaHoraFim: Date | null | undefined;
      if (body.escalaHoraFim !== undefined) {
        escalaHoraFim = parseHoraCivil(body.escalaHoraFim);
        if (!escalaHoraFim) throw erroDeNegocio('Hora de fim inválida.', 'REGRA_DE_NEGOCIO');
      }

      const atualizado = await emTransacao(prisma, async (tx) => {
        const colaborador = await tx.colaborador.update({
          where: { id: params.id },
          data: {
            ...(body.nome !== undefined ? { nome: body.nome } : {}),
            ...(body.rtId !== undefined ? { rtId: body.rtId } : {}),
            ...(body.ativo !== undefined ? { ativo: body.ativo } : {}),
            ...(escalaHoraInicio !== undefined ? { escalaHoraInicio } : {}),
            ...(escalaHoraFim !== undefined ? { escalaHoraFim } : {}),
          },
          include: { rt: { select: { id: true, nome: true } } },
        });

        await registrarAuditoria(tx, {
          atorTipo: 'ADMIN',
          atorId: ator.adminId,
          acao: 'COLABORADOR_ALTERADO',
          entidade: 'colaborador',
          entidadeId: params.id,
          payload: {
            campos: {
              ...(body.nome !== undefined ? { nome: body.nome } : {}),
              ...(body.rtId !== undefined ? { rtId: body.rtId } : {}),
              ...(body.ativo !== undefined ? { ativo: body.ativo } : {}),
            },
            impacto: temImpacto ? impacto : null,
          },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        });

        return colaborador;
      });

      return {
        id: atualizado.id,
        nome: atualizado.nome,
        matricula: atualizado.matricula,
        rt: atualizado.rt,
        ativo: atualizado.ativo,
        impacto: temImpacto ? impacto : undefined,
      };
    },
  });
}

export const PATCH = criarHandlerAtualizar(obterPrisma());
