/**
 * `POST /api/marcacoes/:id` (repurposed do antigo `DELETE`, ver
 * `src/app/api/marcacoes/[id]/route.ts`) — pedido do usuário: colaborador
 * não cancela mais a própria extra direto. Em vez de chamar `cancelar_extra`
 * (FN-006) como antes, este módulo só abre um pedido
 * (`solicitacao_cancelamento`, status `PENDENTE`) — o cancelamento de fato só
 * acontece quando um admin aprova (`@/server/services/solicitacoes-cancelamento`,
 * que aí sim chama `cancelar_extra` com origem ADMIN).
 *
 * "Própria marcação" é checado aqui de verdade (diferente do antigo fluxo,
 * que delegava isso pra `cancelar_extra` via SQL) — `findFirst` filtrando
 * por `colaboradorId` já resolve "de terceiro" como 404 (`MARCACAO_INEXISTENTE`
 * de fato, `SEC-CONF`: nunca revela que a marcação existe se for de outra
 * pessoa), sem precisar de uma segunda checagem de propriedade.
 *
 * Idempotente por construção: se já existe uma solicitação `PENDENTE` para
 * esta marcação, devolve ela mesma em vez de criar uma duplicada — tanto por
 * `findFirst` antes do `create` quanto, sob concorrência real, pelo índice
 * único parcial `solicitacao_cancelamento_pendente_unica` (banco é a decisão
 * final, não o `findFirst` da aplicação).
 */
import type { PrismaClient } from '@prisma/client';
import { emTransacao, ehViolacaoDeUnicidade } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { erroNaoEncontrado, erroDeNegocio } from '@/server/http/erros';

export type ClienteSolicitarCancelamento = Pick<PrismaClient, '$transaction'>;

export interface SolicitarCancelamentoParams {
  marcacaoId: string;
  colaboradorId: string;
  motivo: string;
  ip: string;
  userAgent: string;
  requestId: string;
}

export interface RespostaSolicitarCancelamento {
  id: string;
  marcacaoId: string;
  status: 'PENDENTE';
  /** `true` quando já existia um pedido pendente e este é ele, não um novo. */
  jaExistia: boolean;
}

export async function solicitarCancelamentoColaborador(
  prisma: ClienteSolicitarCancelamento,
  params: SolicitarCancelamentoParams,
): Promise<RespostaSolicitarCancelamento> {
  return emTransacao(prisma as PrismaClient, async (tx) => {
    // "de terceiro" e "inexistente" chegam ao mesmo 404 — nunca revela a
    // existência da marcação de outra pessoa (SEC-CONF).
    const marcacao = await tx.marcacao.findFirst({
      where: { id: params.marcacaoId, colaboradorId: params.colaboradorId },
      select: { id: true, status: true, plantao: { select: { ciclo: { select: { status: true } } } } },
    });
    if (!marcacao) throw erroNaoEncontrado('Marcação não encontrada.');

    if (marcacao.status !== 'CONFIRMADA') {
      throw erroDeNegocio('Esta marcação já está cancelada.');
    }
    if (marcacao.plantao.ciclo.status === 'FECHADO') {
      throw erroDeNegocio('Este ciclo já está fechado — não é possível pedir cancelamento.');
    }

    const existente = await tx.solicitacaoCancelamento.findFirst({
      where: { marcacaoId: params.marcacaoId, status: 'PENDENTE' },
      select: { id: true },
    });
    if (existente) {
      return { id: existente.id, marcacaoId: params.marcacaoId, status: 'PENDENTE', jaExistia: true };
    }

    let criada;
    try {
      criada = await tx.solicitacaoCancelamento.create({
        data: { marcacaoId: params.marcacaoId, colaboradorId: params.colaboradorId, motivo: params.motivo },
      });
    } catch (erro) {
      // Corrida: outra requisição criou o PENDENTE entre o findFirst acima e
      // este create — o índice único parcial rejeita, e aqui só devolvemos o
      // que já existe, em vez de propagar um 500 pro colaborador.
      if (ehViolacaoDeUnicidade(erro)) {
        const jaExistente = await tx.solicitacaoCancelamento.findFirstOrThrow({
          where: { marcacaoId: params.marcacaoId, status: 'PENDENTE' },
          select: { id: true },
        });
        return { id: jaExistente.id, marcacaoId: params.marcacaoId, status: 'PENDENTE', jaExistia: true };
      }
      throw erro;
    }

    await registrarAuditoria(tx, {
      atorTipo: 'COLABORADOR',
      atorId: params.colaboradorId,
      acao: 'CANCELAMENTO_SOLICITADO',
      entidade: 'solicitacao_cancelamento',
      entidadeId: criada.id,
      payload: { marcacaoId: params.marcacaoId, motivo: params.motivo },
      ip: params.ip,
      userAgent: params.userAgent,
      requestId: params.requestId,
    });

    return { id: criada.id, marcacaoId: params.marcacaoId, status: 'PENDENTE', jaExistia: false };
  });
}
