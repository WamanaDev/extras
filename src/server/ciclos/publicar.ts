/**
 * API-ADM-CIC-005 — `POST /api/admin/ciclos/:id/publicar`.
 *
 * `FOR UPDATE` no ciclo; transição só de `RASCUNHO` (spec, "ACID": "duas
 * publicações concorrentes: a segunda vê `PUBLICADO` e recebe
 * `TRANSICAO_INVALIDA`").
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { emTransacao, type ClienteTransacao } from '@/server/db/tx';
import { erroNaoEncontrado } from '@/server/http/erros';
import { registrarAuditoria } from '@/server/audit/registrar';
import type { AtorAdmin, ContextoRequisicao } from '@/server/http/handler';
import { erroCiclo } from './compartilhado';

export const PublicarCicloBodySchema = z.object({
  ignorarAvisos: z.boolean().optional(),
});

export type PublicarCicloBody = z.infer<typeof PublicarCicloBodySchema>;

export interface Aviso {
  tipo: 'DEFICIT_COBERTURA' | 'COLABORADOR_SEM_ESCALA' | 'JANELA_NO_PASSADO';
  detalhe: string;
}

export interface ResultadoPublicarCiclo {
  ciclo: { id: string; status: string };
  avisos: Aviso[];
}

interface CicloRow {
  id: string;
  status: 'RASCUNHO' | 'PUBLICADO' | 'FECHADO';
  escala_gerada_em: Date | null;
  fechamento_marcacao: Date | null;
}

async function buscarCicloParaPublicar(tx: ClienteTransacao, id: string): Promise<CicloRow> {
  const linhas = await tx.$queryRaw<CicloRow[]>`SELECT * FROM ciclo WHERE id = ${id}::uuid FOR UPDATE`;
  const ciclo = linhas[0];
  if (!ciclo) throw erroNaoEncontrado();
  return ciclo;
}

function avisosParaDetalhes(avisos: Aviso[]): Record<string, string> {
  const detalhes: Record<string, string> = {};
  for (const aviso of avisos) detalhes[aviso.tipo] = aviso.detalhe;
  return detalhes;
}

export async function publicarCiclo(
  prisma: PrismaClient,
  cicloId: string,
  body: PublicarCicloBody,
  ator: AtorAdmin,
  ctx: ContextoRequisicao,
): Promise<ResultadoPublicarCiclo> {
  return emTransacao(prisma, async (tx) => {
    const ciclo = await buscarCicloParaPublicar(tx, cicloId);

    if (ciclo.status !== 'RASCUNHO') {
      throw erroCiclo(409, 'TRANSICAO_INVALIDA', 'Ciclo não está em rascunho — só um rascunho pode ser publicado.');
    }
    if (!ciclo.escala_gerada_em) {
      throw erroCiclo(409, 'ESCALA_NAO_GERADA', 'Gere a escala antes de publicar o ciclo.');
    }

    const totalPlantoes = await tx.plantao.count({ where: { cicloId, ativo: true } });
    if (totalPlantoes === 0) {
      throw erroCiclo(409, 'SEM_PLANTOES', 'Não há plantões ativos neste ciclo.');
    }

    const cobertura = await tx.$queryRaw<Array<{ deficit: number }>>`
      SELECT deficit FROM cobertura_ciclo(${cicloId}::uuid)
    `;
    const diasComDeficit = cobertura.filter((linha) => linha.deficit > 0).length;

    const semEscala = await tx.colaborador.count({
      where: { ativo: true, escalasDia: { none: { cicloId } } },
    });

    const avisos: Aviso[] = [];
    if (diasComDeficit > 0) {
      avisos.push({
        tipo: 'DEFICIT_COBERTURA',
        detalhe: `${diasComDeficit} dia(s)/turno com cobertura abaixo do mínimo.`,
      });
    }
    if (semEscala > 0) {
      avisos.push({
        tipo: 'COLABORADOR_SEM_ESCALA',
        detalhe: `${semEscala} colaborador(es) ativo(s) sem escala neste ciclo.`,
      });
    }
    if (ciclo.fechamento_marcacao && ciclo.fechamento_marcacao.getTime() < ctx.agora.getTime()) {
      avisos.push({ tipo: 'JANELA_NO_PASSADO', detalhe: 'A janela de marcação já está no passado.' });
    }

    if (avisos.length > 0 && body.ignorarAvisos !== true) {
      throw erroCiclo(
        409,
        'AVISOS_NAO_CONFIRMADOS',
        'Existem avisos a confirmar antes de publicar este ciclo.',
        avisosParaDetalhes(avisos),
      );
    }

    const atualizado = await tx.ciclo.update({ where: { id: cicloId }, data: { status: 'PUBLICADO' } });

    await registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: ator.adminId,
      acao: 'CICLO_PUBLICADO',
      entidade: 'ciclo',
      entidadeId: cicloId,
      payload: { avisos, avisosIgnorados: body.ignorarAvisos === true },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return { ciclo: { id: atualizado.id, status: atualizado.status }, avisos };
  });
}
