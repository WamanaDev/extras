/**
 * API-ADM-CIC-006 — `POST /api/admin/ciclos/:id/fechar`.
 *
 * Transição + snapshot do resumo + auditoria numa transação só — "o resumo
 * gravado na auditoria é o retrato oficial do fechamento" (spec, "ACID").
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { emTransacao, type ClienteTransacao } from '@/server/db/tx';
import { erroNaoEncontrado } from '@/server/http/erros';
import { registrarAuditoria } from '@/server/audit/registrar';
import type { AtorAdmin, ContextoRequisicao } from '@/server/http/handler';
import { erroCiclo } from './compartilhado';

export const FecharCicloBodySchema = z.object({
  confirmacao: z.string(),
});

export type FecharCicloBody = z.infer<typeof FecharCicloBodySchema>;

export interface ResumoFechamento {
  colaboradores: number;
  extras: number;
  horas: number;
  deficits: number;
}

export interface ResultadoFecharCiclo {
  ciclo: { id: string; status: string };
  resumo: ResumoFechamento;
}

interface CicloRow {
  id: string;
  status: 'RASCUNHO' | 'PUBLICADO' | 'FECHADO';
}

async function buscarCicloParaFechar(tx: ClienteTransacao, id: string): Promise<CicloRow> {
  const linhas = await tx.$queryRaw<CicloRow[]>`SELECT * FROM ciclo WHERE id = ${id}::uuid FOR UPDATE`;
  const ciclo = linhas[0];
  if (!ciclo) throw erroNaoEncontrado();
  return ciclo;
}

async function montarResumo(tx: ClienteTransacao, cicloId: string): Promise<ResumoFechamento> {
  const agregados = await tx.$queryRaw<Array<{ colaboradores: bigint; extras: bigint; horas: bigint }>>`
    SELECT count(DISTINCT m.colaborador_id)::bigint AS colaboradores,
           count(*)::bigint AS extras,
           COALESCE(sum(p.carga_horas), 0)::bigint AS horas
      FROM marcacao m
      JOIN plantao p ON p.id = m.plantao_id
     WHERE p.ciclo_id = ${cicloId}::uuid AND m.status = 'CONFIRMADA'
  `;
  const linha = agregados[0] ?? { colaboradores: 0n, extras: 0n, horas: 0n };

  const cobertura = await tx.$queryRaw<Array<{ deficit: number }>>`
    SELECT deficit FROM cobertura_ciclo(${cicloId}::uuid)
  `;
  const deficits = cobertura.reduce((acc, item) => acc + item.deficit, 0);

  return {
    colaboradores: Number(linha.colaboradores),
    extras: Number(linha.extras),
    horas: Number(linha.horas),
    deficits,
  };
}

export async function fecharCiclo(
  prisma: PrismaClient,
  cicloId: string,
  body: FecharCicloBody,
  ator: AtorAdmin,
  ctx: ContextoRequisicao,
): Promise<ResultadoFecharCiclo> {
  if (body.confirmacao !== 'FECHAR') {
    throw erroCiclo(422, 'CONFIRMACAO_INVALIDA', 'Confirmação inválida — envie "FECHAR" para prosseguir.');
  }

  return emTransacao(prisma, async (tx) => {
    const ciclo = await buscarCicloParaFechar(tx, cicloId);
    if (ciclo.status !== 'PUBLICADO') {
      throw erroCiclo(409, 'TRANSICAO_INVALIDA', 'Só um ciclo publicado pode ser fechado.');
    }

    const resumo = await montarResumo(tx, cicloId);
    const atualizado = await tx.ciclo.update({ where: { id: cicloId }, data: { status: 'FECHADO' } });

    await registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: ator.adminId,
      acao: 'CICLO_FECHADO',
      entidade: 'ciclo',
      entidadeId: cicloId,
      payload: { resumo },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return { ciclo: { id: atualizado.id, status: atualizado.status }, resumo };
  });
}
