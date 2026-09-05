/**
 * `marcarNotificacaoComoLida` — `POST /api/notificacoes/:id/marcar-lida`.
 *
 * Checagem de posse: só marca se a notificação pertencer ao colaborador da
 * sessão — senão `404` (nunca `403`, "recurso de terceiro → 404, nunca
 * vazamos existência", `contrato-comum.md`).
 */
import type { PrismaClient } from '@prisma/client';
import { erroNaoEncontrado } from '@/server/http/erros';

export type ClienteMarcarLida = Pick<PrismaClient, 'notificacao'>;

export async function marcarNotificacaoComoLida(
  prisma: ClienteMarcarLida,
  notificacaoId: string,
  colaboradorId: string,
  agora: Date,
): Promise<void> {
  const resultado = await prisma.notificacao.updateMany({
    where: { id: notificacaoId, colaboradorId },
    data: { lida: true, lidaEm: agora },
  });

  if (resultado.count === 0) {
    throw erroNaoEncontrado('Notificação não encontrada.');
  }
}
