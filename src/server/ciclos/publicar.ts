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
import { criarNotificacao } from '@/server/notificacoes/criar';
import { redigirParaLog } from '@/server/log/redact';
import type { AtorAdmin, ContextoRequisicao } from '@/server/http/handler';
import { erroCiclo } from './compartilhado';

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

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
  let competencia = '';

  const resultado = await emTransacao(prisma, async (tx) => {
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
    competencia = `${NOMES_MES[atualizado.mes - 1]}/${atualizado.ano}`;

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

  // Notificação a todos os colaboradores ATIVOS (pedido do usuário) só
  // DEPOIS do commit — mesmo padrão de `broadcastEscalaAtualizada`
  // (`escala/lote/route.ts`): nunca desfaz a publicação se o envio falhar. O
  // try/catch é essencial aqui (diferente de `criarNotificacao`/
  // `enviarPushParaColaborador`, que só protegem o *push*): sem ele, uma
  // falha ao GRAVAR uma notificação (`notificacao.create`) faria a chamada
  // inteira rejeitar DEPOIS que o ciclo já foi publicado de verdade — o
  // admin veria um erro na tela pra uma publicação que na verdade deu certo.
  try {
    const colaboradoresAtivos = await prisma.colaborador.findMany({ where: { ativo: true }, select: { id: true } });
    await Promise.all(
      colaboradoresAtivos.map((colaborador) =>
        criarNotificacao(prisma, {
          colaboradorId: colaborador.id,
          tipo: 'CICLO_PUBLICADO',
          titulo: 'Escala publicada',
          mensagem: `A escala de ${competencia} foi publicada.`,
          link: '/minha-escala',
        }),
      ),
    );
  } catch (erro) {
    // eslint-disable-next-line no-console
    console.error(redigirParaLog({ msg: 'falha ao notificar colaboradores da publicação do ciclo', cicloId, erro: String(erro) }));
  }

  return resultado;
}
