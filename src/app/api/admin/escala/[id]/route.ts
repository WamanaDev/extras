/**
 * `API-ADM-ESC-002` — `PATCH /api/admin/escala/:id`.
 *
 * Lança ou altera a ausência de um dia (`D → F/FT/FE` ou volta). Ver
 * `specs/04-api/admin-escala/API-ADM-ESC-002-alterar-dia.md` — spec marcada
 * "alteração exige revisão humana": implementação segue o fluxo/ACID/CIA
 * literalmente, nenhuma regra relaxada.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { erroNaoEncontrado } from '@/server/http/erros';
import { obterPrisma } from '@/server/db/client';
import { emTransacao, travarColaborador } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { erroDominioEscala } from '@/server/services/escala-admin/erros';
import { simularCoberturaAposTroca, coberturaAntesComoImpacto } from '@/server/services/escala-admin/cobertura';
import { fonteBlocosOcupadosPrisma, revalidarJornadaDoDia } from '@/server/services/escala-admin/jornada';
import { broadcastEscalaAtualizada } from '@/server/services/escala-admin/broadcast';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({
  codigo: z.string().min(1),
  observacao: z.string().optional(),
  confirmarImpacto: z.boolean().optional(),
});

interface LinhaCoberturaCiclo {
  data: Date;
  rt_codigo: string;
  turno: 'DIURNO' | 'NOTURNO';
  total: number;
  minimo: number;
}

export const PATCH = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  params: ParamsSchema,
  body: BodySchema,
  handler: async ({ ator, params, body, ctx }) => {
    const prisma = await obterPrisma();

    const resultado = await emTransacao(prisma, async (tx) => {
      const escalaDia = await tx.escalaDia.findUnique({
        where: { id: params.id },
        include: {
          codigoEscala: true,
          ciclo: true,
          colaborador: { include: { rt: true, trocasEscala: true } },
        },
      });
      if (!escalaDia) throw erroNaoEncontrado('Dia de escala não encontrado.');

      if (escalaDia.ciclo.status === 'FECHADO') {
        throw erroDominioEscala(409, 'CICLO_FECHADO', 'Este ciclo está fechado e não pode mais ser alterado.');
      }

      const codigoNovo = await tx.codigoEscala.findFirst({ where: { codigo: body.codigo, ativo: true } });
      if (!codigoNovo) {
        throw erroDominioEscala(422, 'CODIGO_INVALIDO', 'Código de escala inválido ou inativo.', { codigo: 'Código de escala inválido ou inativo.' });
      }

      // Passo 2: advisory lock do colaborador, mesma ordem de FN-005 — impede
      // que a alteração corra contra uma marcação de extra em andamento (I,
      // anomalia A6 de SEC-ACID).
      await travarColaborador(tx, escalaDia.colaboradorId);

      // Passo 3: impacto — extras marcadas no mesmo dia; cobertura antes/depois.
      const extrasAfetadas = await tx.marcacao.findMany({
        where: {
          colaboradorId: escalaDia.colaboradorId,
          status: 'CONFIRMADA',
          plantao: { data: escalaDia.data },
        },
        select: { id: true, plantaoId: true },
      });

      const linhasCobertura = await tx.$queryRaw<LinhaCoberturaCiclo[]>`SELECT * FROM cobertura_ciclo(${escalaDia.cicloId}::uuid)`;
      const coberturaDoDia = linhasCobertura.find(
        (l) => l.data.getUTCDate() === escalaDia.data.getUTCDate() && l.rt_codigo === escalaDia.colaborador.rt.nome,
      );
      const antes = coberturaDoDia
        ? { rt: coberturaDoDia.rt_codigo, turno: coberturaDoDia.turno, total: Number(coberturaDoDia.total), minimo: Number(coberturaDoDia.minimo) }
        : { rt: escalaDia.colaborador.rt.nome, turno: escalaDia.colaborador.turnoPadrao, total: 0, minimo: 0 };

      const impactoCobertura = simularCoberturaAposTroca(antes, escalaDia.codigoEscala.presenca, codigoNovo.presenca);

      // Passo 4: impacto sem confirmarImpacto → 409 com a lista (RN-10).
      const temImpacto = extrasAfetadas.length > 0;
      if (temImpacto && !body.confirmarImpacto) {
        throw erroDominioEscala(
          409,
          'IMPACTO_NAO_CONFIRMADO',
          'Esta alteração afeta extras já marcadas. Confirme para prosseguir.',
        );
      }

      // Passo 5: código novo com ocupaHorario = true → revalidar jornada
      // (F → D/FT pode criar 36h com extras já marcadas em volta).
      if (codigoNovo.ocupaHorario) {
        const resultadoJornada = await revalidarJornadaDoDia({
          fonte: fonteBlocosOcupadosPrisma(tx, escalaDia.colaboradorId),
          colaborador: escalaDia.colaborador,
          trocas: escalaDia.colaborador.trocasEscala,
          data: escalaDia.data,
          maxBlocos: escalaDia.ciclo.maxBlocosSeguidos,
          excluirEscalaDiaId: escalaDia.id,
        });
        if (resultadoJornada === 'EXCEDE_JORNADA') {
          throw erroDominioEscala(409, 'EXCEDE_JORNADA', 'Esta alteração faria o colaborador exceder a jornada máxima seguida.');
        }
      }

      // Passo 6: aplicar, auditar AUSENCIA_ALTERADA com anterior → novo.
      const codigoAnterior = escalaDia.codigoEscala.codigo;
      const escalaDiaAtualizada = await tx.escalaDia.update({
        where: { id: escalaDia.id },
        data: {
          codigoEscalaId: codigoNovo.id,
          ...(body.observacao !== undefined ? { observacao: body.observacao } : {}),
        },
        include: { codigoEscala: true },
      });

      await registrarAuditoria(tx, {
        atorTipo: 'ADMIN',
        atorId: ator.adminId,
        acao: 'AUSENCIA_ALTERADA',
        entidade: 'escala_dia',
        entidadeId: escalaDia.id,
        payload: { anterior: codigoAnterior, novo: codigoNovo.codigo, extrasAfetadas: extrasAfetadas.map((m) => m.id) },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });

      return {
        escalaDia: {
          id: escalaDiaAtualizada.id,
          data: escalaDiaAtualizada.data.toISOString().slice(0, 10),
          codigo: escalaDiaAtualizada.codigoEscala.codigo,
          observacao: escalaDiaAtualizada.observacao,
        },
        impacto: {
          extrasAfetadas: extrasAfetadas.map((m) => ({ marcacaoId: m.id, plantaoId: m.plantaoId })),
          coberturaAntes: coberturaAntesComoImpacto(antes),
          coberturaDepois: impactoCobertura,
        },
        cicloId: escalaDia.cicloId,
        colaboradorId: escalaDia.colaboradorId,
      };
    });

    // Passo 7: broadcast só após o commit (SEC-ACID / canais.md).
    await broadcastEscalaAtualizada(resultado.cicloId, {
      colaboradorId: resultado.colaboradorId,
      data: resultado.escalaDia.data,
    });

    return { escalaDia: resultado.escalaDia, impacto: resultado.impacto };
  },
});
