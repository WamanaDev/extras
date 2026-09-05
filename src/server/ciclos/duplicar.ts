/**
 * API-ADM-CIC-007 — `POST /api/admin/ciclos/:id/duplicar`.
 *
 * `$transaction` inteiro: "ciclo criado sem os plantões é pior que falhar
 * inteiro" (spec, "ACID"). Plantões mapeados por dia-do-mês + turno; dia 31
 * num mês de 30 é descartado (CIA, "D"). `vagasOcupadas = 0` sempre — copiar
 * o contador do mês anterior corromperia o ciclo novo. `bloqueado` de
 * `participacao_ciclo` nunca é copiado (CIA, "I").
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria, type AcaoAuditoria } from '@/server/audit/registrar';
import { erroNaoEncontrado } from '@/server/http/erros';
import type { AtorAdmin, ContextoRequisicao } from '@/server/http/handler';
import { ACAO_CICLO_CRIADO, ehUnicidadeDe, erroCiclo } from './compartilhado';

export const DuplicarCicloBodySchema = z.object({
  ano: z.number().int().min(2000).max(2100),
  mes: z.number().int().min(1).max(12),
  copiarPlantoes: z.boolean().optional(),
  copiarParticipacoes: z.boolean().optional(),
});

export type DuplicarCicloBody = z.infer<typeof DuplicarCicloBodySchema>;

export interface ResultadoDuplicarCiclo {
  ciclo: { id: string; ano: number; mes: number; status: string };
  plantoesCriados: number;
  participacoesCriadas: number;
  /** Não faz parte do contrato mínimo da spec, mas materializa "o descarte volta na resposta" (CIA, "D") sem remover nenhum campo exigido. */
  plantoesDescartados: number;
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export async function duplicarCiclo(
  prisma: PrismaClient,
  cicloOrigemId: string,
  body: DuplicarCicloBody,
  ator: AtorAdmin,
  ctx: ContextoRequisicao,
): Promise<ResultadoDuplicarCiclo> {
  return emTransacao(prisma, async (tx) => {
    const origem = await tx.ciclo.findUnique({ where: { id: cicloOrigemId } });
    if (!origem) {
      throw erroNaoEncontrado();
    }

    let destino;
    try {
      destino = await tx.ciclo.create({
        data: {
          ano: body.ano,
          mes: body.mes,
          limitePadrao: origem.limitePadrao,
          permiteCruzada: origem.permiteCruzada,
          permiteExtraEmFolga: origem.permiteExtraEmFolga,
          maxBlocosSeguidos: origem.maxBlocosSeguidos,
        },
      });
    } catch (erroCapturado) {
      if (ehUnicidadeDe(erroCapturado, 'ciclo_unico')) {
        throw erroCiclo(409, 'CICLO_JA_EXISTE', 'Já existe um ciclo cadastrado para o ano/mês de destino.');
      }
      throw erroCapturado;
    }

    let plantoesCriados = 0;
    let plantoesDescartados = 0;
    const copiarPlantoes = body.copiarPlantoes !== false;
    if (copiarPlantoes) {
      const plantoesOrigem = await tx.plantao.findMany({ where: { cicloId: cicloOrigemId, ativo: true } });
      const ultimoDiaDestino = ultimoDiaDoMes(body.ano, body.mes);

      for (const plantao of plantoesOrigem) {
        const dia = plantao.data.getUTCDate();
        if (dia > ultimoDiaDestino) {
          plantoesDescartados += 1;
          continue;
        }
        const novaData = new Date(Date.UTC(body.ano, body.mes - 1, dia));
        await tx.plantao.create({
          data: {
            cicloId: destino.id,
            rtId: plantao.rtId,
            data: novaData,
            tipo: plantao.tipo,
            horaInicio: plantao.horaInicio,
            horaFim: plantao.horaFim,
            cargaHoras: plantao.cargaHoras,
            vagasTotais: plantao.vagasTotais,
            vagasOcupadas: 0,
            permiteCruzada: plantao.permiteCruzada,
            observacao: plantao.observacao,
          },
        });
        plantoesCriados += 1;
      }
    }

    let participacoesCriadas = 0;
    const copiarParticipacoes = body.copiarParticipacoes === true;
    if (copiarParticipacoes) {
      const participacoesOrigem = await tx.participacaoCiclo.findMany({ where: { cicloId: cicloOrigemId } });
      for (const participacao of participacoesOrigem) {
        await tx.participacaoCiclo.create({
          data: {
            cicloId: destino.id,
            colaboradorId: participacao.colaboradorId,
            limiteOverride: participacao.limiteOverride,
            permiteCruzada: participacao.permiteCruzada,
            // `bloqueado`/`motivo` deliberadamente NÃO copiados (CIA, "I").
            bloqueado: false,
            motivo: null,
          },
        });
        participacoesCriadas += 1;
      }
    }

    await registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: ator.adminId,
      acao: ACAO_CICLO_CRIADO as AcaoAuditoria,
      entidade: 'ciclo',
      entidadeId: destino.id,
      payload: { origemId: cicloOrigemId, plantoesCriados, plantoesDescartados, participacoesCriadas },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return {
      ciclo: { id: destino.id, ano: destino.ano, mes: destino.mes, status: destino.status },
      plantoesCriados,
      participacoesCriadas,
      plantoesDescartados,
    };
  });
}
