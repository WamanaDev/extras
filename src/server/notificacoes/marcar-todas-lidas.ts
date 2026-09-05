/**
 * `marcarTodasNotificacoesComoLidas` — `POST /api/notificacoes/marcar-todas-lidas`.
 * Marca todas as não lidas do colaborador da sessão. Idempotente: chamar de
 * novo sem nada pendente não é erro, só atualiza zero linhas.
 */
import type { PrismaClient } from '@prisma/client';

export type ClienteMarcarTodasLidas = Pick<PrismaClient, 'notificacao'>;

export async function marcarTodasNotificacoesComoLidas(
  prisma: ClienteMarcarTodasLidas,
  colaboradorId: string,
  agora: Date,
): Promise<void> {
  await prisma.notificacao.updateMany({
    where: { colaboradorId, lida: false },
    data: { lida: true, lidaEm: agora },
  });
}
