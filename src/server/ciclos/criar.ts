/**
 * API-ADM-CIC-002 — `POST /api/admin/ciclos`.
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria, type AcaoAuditoria } from '@/server/audit/registrar';
import type { AtorAdmin, ContextoRequisicao } from '@/server/http/handler';
import { ACAO_CICLO_CRIADO, ehUnicidadeDe, erroCiclo } from './compartilhado';

export const CriarCicloBodySchema = z
  .object({
    ano: z.number().int().min(2000).max(2100),
    mes: z.number().int().min(1).max(12),
    limitePadrao: z.number().int().min(0),
    permiteCruzada: z.boolean().optional(),
    permiteExtraEmFolga: z.boolean().optional(),
    maxBlocosSeguidos: z.number().int().min(1).max(3).optional(),
    aberturaMarcacao: z.string().datetime({ offset: true }).optional(),
    fechamentoMarcacao: z.string().datetime({ offset: true }).optional(),
    /** Exigido quando `maxBlocosSeguidos > 2` — exceção formal (CIA, "I"). */
    justificativa: z.string().min(1).optional(),
  })
  .superRefine((dados, ctx) => {
    if (dados.maxBlocosSeguidos !== undefined && dados.maxBlocosSeguidos > 2 && !dados.justificativa) {
      ctx.addIssue({
        code: 'custom',
        path: ['justificativa'],
        message: 'Justificativa obrigatória para maxBlocosSeguidos > 2.',
      });
    }
    if (
      dados.aberturaMarcacao &&
      dados.fechamentoMarcacao &&
      new Date(dados.aberturaMarcacao).getTime() >= new Date(dados.fechamentoMarcacao).getTime()
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['fechamentoMarcacao'],
        message: 'Fechamento deve ser depois da abertura.',
      });
    }
  });

export type CriarCicloBody = z.infer<typeof CriarCicloBodySchema>;

export interface CicloCriado {
  id: string;
  ano: number;
  mes: number;
  status: string;
  limitePadrao: number;
  permiteCruzada: boolean;
  permiteExtraEmFolga: boolean;
  maxBlocosSeguidos: number;
  aberturaMarcacao: string | null;
  fechamentoMarcacao: string | null;
}

/**
 * `ciclo_unico (ano, mes)` impede duplicata mesmo em requisições concorrentes
 * — nunca faz `SELECT` antes para "verificar se existe" (spec, seção "ACID"):
 * isso seria exatamente a corrida que a constraint resolve. O `INSERT` vai
 * direto; `23505` na constraint `ciclo_unico` vira `CICLO_JA_EXISTE`.
 */
export async function criarCiclo(
  prisma: PrismaClient,
  body: CriarCicloBody,
  ator: AtorAdmin,
  ctx: ContextoRequisicao,
): Promise<CicloCriado> {
  return emTransacao(prisma, async (tx) => {
    let ciclo;
    try {
      ciclo = await tx.ciclo.create({
        data: {
          ano: body.ano,
          mes: body.mes,
          limitePadrao: body.limitePadrao,
          permiteCruzada: body.permiteCruzada ?? true,
          permiteExtraEmFolga: body.permiteExtraEmFolga ?? false,
          maxBlocosSeguidos: body.maxBlocosSeguidos ?? 2,
          aberturaMarcacao: body.aberturaMarcacao ? new Date(body.aberturaMarcacao) : null,
          fechamentoMarcacao: body.fechamentoMarcacao ? new Date(body.fechamentoMarcacao) : null,
        },
      });
    } catch (erroCapturado) {
      if (ehUnicidadeDe(erroCapturado, 'ciclo_unico')) {
        throw erroCiclo(409, 'CICLO_JA_EXISTE', 'Já existe um ciclo cadastrado para este ano e mês.');
      }
      throw erroCapturado;
    }

    await registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: ator.adminId,
      acao: ACAO_CICLO_CRIADO as AcaoAuditoria,
      entidade: 'ciclo',
      entidadeId: ciclo.id,
      payload: { depois: ciclo, justificativa: body.justificativa ?? null },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return {
      id: ciclo.id,
      ano: ciclo.ano,
      mes: ciclo.mes,
      status: ciclo.status,
      limitePadrao: ciclo.limitePadrao,
      permiteCruzada: ciclo.permiteCruzada,
      permiteExtraEmFolga: ciclo.permiteExtraEmFolga,
      maxBlocosSeguidos: ciclo.maxBlocosSeguidos,
      aberturaMarcacao: ciclo.aberturaMarcacao ? ciclo.aberturaMarcacao.toISOString() : null,
      fechamentoMarcacao: ciclo.fechamentoMarcacao ? ciclo.fechamentoMarcacao.toISOString() : null,
    };
  });
}
