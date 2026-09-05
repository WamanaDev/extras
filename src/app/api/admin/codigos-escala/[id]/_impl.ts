/**
 * `PATCH /api/admin/codigos-escala/:id` — altera descrição/flags/cor de um código.
 * `DELETE /api/admin/codigos-escala/:id` — desativa (nunca exclui — DOM-003.5).
 *
 * Mesmo gap de spec de `route.ts` no diretório pai (ver doc-comment lá).
 *
 * DOM-003.6 (revisado): código `bloqueado` (D/F/FE) não aceita `DELETE`, nem
 * `PATCH` de `descricao`/`presenca`/`ocupaHorario`/`remunerada`/`ativo` — só
 * `cor` pode ser alterada num código bloqueado (pedido do usuário: "apesar
 * de D, F e FE serem travados e não opcionais, coloque a configuração das
 * cores deles"; legenda/badge de um código fixo ainda deve poder ser
 * personalizada visualmente, sem abrir a porta pra mexer em regra de
 * negócio). `bloqueado` em si nunca é alterável por API (não está no corpo
 * aceito, `.strict()` rejeitaria).
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { defineHandler } from '@/server/http/handler';
import { erroDeNegocio, erroNaoEncontrado } from '@/server/http/erros';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';

const ParamsSchema = z.object({ id: z.string().uuid() });

const AtualizarCodigoSchema = z
  .object({
    descricao: z.string().trim().min(1).max(80).optional(),
    presenca: z.boolean().optional(),
    ocupaHorario: z.boolean().optional(),
    remunerada: z.boolean().optional(),
    ativo: z.boolean().optional(),
    cor: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve ser hexadecimal, ex.: #2E7D32.')
      .optional(),
  })
  .strict();

export function criarHandlerAtualizar(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    params: ParamsSchema,
    body: AtualizarCodigoSchema,
    handler: async ({ params, body, ator, ctx }) => {
      const atual = await prisma.codigoEscala.findUnique({ where: { id: params.id } });
      if (!atual) throw erroNaoEncontrado('Código de escala não encontrado.');

      if (atual.bloqueado) {
        const { cor, ...resto } = body;
        const alteraAlgoAlemDaCor = Object.values(resto).some((valor) => valor !== undefined);
        if (alteraAlgoAlemDaCor) throw erroDeNegocio('Este código é fixo do sistema — só a cor pode ser alterada.', 'REGRA_DE_NEGOCIO');
        if (cor === undefined) throw erroDeNegocio('Este código é fixo do sistema — só a cor pode ser alterada.', 'REGRA_DE_NEGOCIO');
      }

      const atualizado = await emTransacao(prisma, async (tx) => {
        const codigo = await tx.codigoEscala.update({
          where: { id: params.id },
          data: {
            ...(body.descricao !== undefined ? { descricao: body.descricao } : {}),
            ...(body.presenca !== undefined ? { presenca: body.presenca } : {}),
            ...(body.ocupaHorario !== undefined ? { ocupaHorario: body.ocupaHorario } : {}),
            ...(body.remunerada !== undefined ? { remunerada: body.remunerada } : {}),
            ...(body.ativo !== undefined ? { ativo: body.ativo } : {}),
            ...(body.cor !== undefined ? { cor: body.cor } : {}),
          },
        });

        await registrarAuditoria(tx, {
          atorTipo: 'ADMIN',
          atorId: ator.adminId,
          acao: 'CODIGO_ESCALA_ALTERADO',
          entidade: 'codigo_escala',
          entidadeId: codigo.id,
          payload: { campos: body },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        });

        return codigo;
      });

      return atualizado;
    },
  });
}

export function criarHandlerDesativar(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    params: ParamsSchema,
    handler: async ({ params, ator, ctx }) => {
      const atual = await prisma.codigoEscala.findUnique({ where: { id: params.id } });
      if (!atual) throw erroNaoEncontrado('Código de escala não encontrado.');
      if (atual.bloqueado) throw erroDeNegocio('Este código é fixo do sistema e não pode ser desativado.', 'REGRA_DE_NEGOCIO');

      // DOM-003.5: excluir código em uso é proibido — aqui "excluir" é sempre desativar (soft-delete), nunca DELETE de linha.
      const emUso = await prisma.escalaDia.count({ where: { codigoEscalaId: params.id } });

      await emTransacao(prisma, async (tx) => {
        await tx.codigoEscala.update({ where: { id: params.id }, data: { ativo: false } });

        await registrarAuditoria(tx, {
          atorTipo: 'ADMIN',
          atorId: ator.adminId,
          acao: 'CODIGO_ESCALA_DESATIVADO',
          entidade: 'codigo_escala',
          entidadeId: params.id,
          payload: { codigo: atual.codigo, emUso: emUso > 0 },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        });
      });

      return { id: params.id, ativo: false };
    },
  });
}

