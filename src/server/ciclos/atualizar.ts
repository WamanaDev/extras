/**
 * API-ADM-CIC-004 — `PATCH /api/admin/ciclos/:id`.
 *
 * Cálculo de impacto e escrita na mesma transação (spec, "ACID": "o impacto
 * listado é o impacto aplicado"). RN-28: desligar `permiteCruzada` **não**
 * desfaz marcações cruzadas existentes — só lista para o admin decidir.
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { emTransacao, type ClienteTransacao } from '@/server/db/tx';
import { erroNaoEncontrado } from '@/server/http/erros';
import { registrarAuditoria } from '@/server/audit/registrar';
import type { AtorAdmin, ContextoRequisicao } from '@/server/http/handler';
import { erroCiclo } from './compartilhado';

export const AtualizarCicloBodySchema = z.object({
  limitePadrao: z.number().int().min(0).optional(),
  permiteCruzada: z.boolean().optional(),
  permiteExtraEmFolga: z.boolean().optional(),
  maxBlocosSeguidos: z.number().int().min(1).max(3).optional(),
  aberturaMarcacao: z.string().datetime({ offset: true }).nullable().optional(),
  fechamentoMarcacao: z.string().datetime({ offset: true }).nullable().optional(),
  confirmarImpacto: z.boolean().optional(),
});

export type AtualizarCicloBody = z.infer<typeof AtualizarCicloBodySchema>;

export interface ColaboradorAfetado {
  colaboradorId: string;
  nome: string;
  matricula: string;
}

export interface ImpactoAtualizacao {
  reducaoLimite: ColaboradorAfetado[];
  cruzadaDesligada: ColaboradorAfetado[];
}

export interface ResultadoAtualizarCiclo {
  ciclo: {
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
  };
  impacto: ImpactoAtualizacao;
}

interface CicloRow {
  id: string;
  ano: number;
  mes: number;
  status: 'RASCUNHO' | 'PUBLICADO' | 'FECHADO';
  limite_padrao: number;
  permite_cruzada: boolean;
  permite_extra_em_folga: boolean;
  max_blocos_seguidos: number;
  abertura_marcacao: Date | null;
  fechamento_marcacao: Date | null;
}

async function buscarCicloParaAtualizar(tx: ClienteTransacao, id: string): Promise<CicloRow> {
  const linhas = await tx.$queryRaw<CicloRow[]>`SELECT * FROM ciclo WHERE id = ${id}::uuid FOR UPDATE`;
  const ciclo = linhas[0];
  if (!ciclo) throw erroNaoEncontrado();
  return ciclo;
}

/** Colaboradores cujo uso atual no ciclo excederia o novo `limitePadrao` (só quem não tem `limiteOverride` próprio — esse continua intocado). */
async function calcularImpactoReducaoLimite(
  tx: ClienteTransacao,
  cicloId: string,
  novoLimite: number,
): Promise<ColaboradorAfetado[]> {
  const linhas = await tx.$queryRaw<ColaboradorAfetado[]>`
    SELECT c.id AS "colaboradorId", c.nome, c.matricula
      FROM marcacao m
      JOIN plantao p ON p.id = m.plantao_id
      JOIN colaborador c ON c.id = m.colaborador_id
      LEFT JOIN participacao_ciclo part ON part.ciclo_id = p.ciclo_id AND part.colaborador_id = c.id
     WHERE p.ciclo_id = ${cicloId}::uuid
       AND m.status = 'CONFIRMADA'
       AND part.limite_override IS NULL
     GROUP BY c.id, c.nome, c.matricula
    HAVING count(*) > ${novoLimite}
     ORDER BY c.nome
  `;
  return linhas;
}

/** Colaboradores com marcação cruzada existente que dependem só da regra do ciclo (não de override em `plantao`/`participacao_ciclo`). */
async function calcularImpactoDesligarCruzada(tx: ClienteTransacao, cicloId: string): Promise<ColaboradorAfetado[]> {
  const linhas = await tx.$queryRaw<ColaboradorAfetado[]>`
    SELECT DISTINCT c.id AS "colaboradorId", c.nome, c.matricula
      FROM marcacao m
      JOIN plantao p ON p.id = m.plantao_id
      JOIN colaborador c ON c.id = m.colaborador_id
      LEFT JOIN participacao_ciclo part ON part.ciclo_id = p.ciclo_id AND part.colaborador_id = c.id
     WHERE p.ciclo_id = ${cicloId}::uuid
       AND m.status = 'CONFIRMADA'
       AND m.cruzada = true
       AND p.permite_cruzada IS NULL
       AND part.permite_cruzada IS NULL
     ORDER BY c.nome
  `;
  return linhas;
}

function paraDetalhes(impacto: ImpactoAtualizacao): Record<string, string> {
  const detalhes: Record<string, string> = {};
  for (const item of impacto.reducaoLimite) {
    detalhes[`reducaoLimite.${item.colaboradorId}`] = `${item.nome} (${item.matricula}) já excede o novo limite.`;
  }
  for (const item of impacto.cruzadaDesligada) {
    detalhes[`cruzadaDesligada.${item.colaboradorId}`] = `${item.nome} (${item.matricula}) tem marcação cruzada existente.`;
  }
  return detalhes;
}

export async function atualizarCiclo(
  prisma: PrismaClient,
  cicloId: string,
  body: AtualizarCicloBody,
  ator: AtorAdmin,
  ctx: ContextoRequisicao,
): Promise<ResultadoAtualizarCiclo> {
  return emTransacao(prisma, async (tx) => {
    const antes = await buscarCicloParaAtualizar(tx, cicloId);
    if (antes.status === 'FECHADO') {
      throw erroCiclo(409, 'CICLO_FECHADO', 'Ciclo fechado não pode ser alterado.');
    }

    const impacto: ImpactoAtualizacao = { reducaoLimite: [], cruzadaDesligada: [] };
    const novoLimite = body.limitePadrao ?? antes.limite_padrao;
    if (body.limitePadrao !== undefined && body.limitePadrao < antes.limite_padrao) {
      impacto.reducaoLimite = await calcularImpactoReducaoLimite(tx, cicloId, novoLimite);
    }
    const desligandoCruzada = body.permiteCruzada === false && antes.permite_cruzada === true;
    if (desligandoCruzada) {
      impacto.cruzadaDesligada = await calcularImpactoDesligarCruzada(tx, cicloId);
    }

    const temImpacto = impacto.reducaoLimite.length > 0 || impacto.cruzadaDesligada.length > 0;
    if (temImpacto && body.confirmarImpacto !== true) {
      throw erroCiclo(
        409,
        'IMPACTO_NAO_CONFIRMADO',
        'Esta alteração afeta colaboradores existentes. Confirme para aplicar mesmo assim.',
        paraDetalhes(impacto),
      );
    }

    const dadosAtualizacao: Record<string, unknown> = {};
    if (body.limitePadrao !== undefined) dadosAtualizacao.limitePadrao = body.limitePadrao;
    if (body.permiteCruzada !== undefined) dadosAtualizacao.permiteCruzada = body.permiteCruzada;
    if (body.permiteExtraEmFolga !== undefined) dadosAtualizacao.permiteExtraEmFolga = body.permiteExtraEmFolga;
    if (body.maxBlocosSeguidos !== undefined) dadosAtualizacao.maxBlocosSeguidos = body.maxBlocosSeguidos;
    if (body.aberturaMarcacao !== undefined) {
      dadosAtualizacao.aberturaMarcacao = body.aberturaMarcacao ? new Date(body.aberturaMarcacao) : null;
    }
    if (body.fechamentoMarcacao !== undefined) {
      dadosAtualizacao.fechamentoMarcacao = body.fechamentoMarcacao ? new Date(body.fechamentoMarcacao) : null;
    }

    const depois = await tx.ciclo.update({ where: { id: cicloId }, data: dadosAtualizacao });

    if (body.limitePadrao !== undefined && body.limitePadrao !== antes.limite_padrao) {
      await registrarAuditoria(tx, {
        atorTipo: 'ADMIN',
        atorId: ator.adminId,
        acao: 'LIMITE_ALTERADO',
        entidade: 'ciclo',
        entidadeId: cicloId,
        payload: { antes: antes.limite_padrao, depois: body.limitePadrao, impacto: impacto.reducaoLimite },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
    }
    if (body.permiteCruzada !== undefined && body.permiteCruzada !== antes.permite_cruzada) {
      await registrarAuditoria(tx, {
        atorTipo: 'ADMIN',
        atorId: ator.adminId,
        acao: 'CRUZADA_ALTERADA',
        entidade: 'ciclo',
        entidadeId: cicloId,
        payload: { antes: antes.permite_cruzada, depois: body.permiteCruzada, impacto: impacto.cruzadaDesligada },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
    }

    return {
      ciclo: {
        id: depois.id,
        ano: depois.ano,
        mes: depois.mes,
        status: depois.status,
        limitePadrao: depois.limitePadrao,
        permiteCruzada: depois.permiteCruzada,
        permiteExtraEmFolga: depois.permiteExtraEmFolga,
        maxBlocosSeguidos: depois.maxBlocosSeguidos,
        aberturaMarcacao: depois.aberturaMarcacao ? depois.aberturaMarcacao.toISOString() : null,
        fechamentoMarcacao: depois.fechamentoMarcacao ? depois.fechamentoMarcacao.toISOString() : null,
      },
      impacto,
    };
  });
}
