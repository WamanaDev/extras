/**
 * `buscarNotificacoes` — `GET /api/notificacoes`, mais recentes primeiro.
 *
 * Convenção de paginação de `contrato-comum.md` (ver `src/server/http/handler.ts`,
 * `RespostaPaginada`): a rota usa `paginacao: true`, este serviço só devolve
 * `{ itens, total }`.
 */
import type { PrismaClient } from '@prisma/client';
import type { RespostaPaginada } from '@/server/http/handler';

export type ClienteListarNotificacoes = Pick<PrismaClient, 'notificacao'>;

export interface NotificacaoResposta {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  link: string | null;
  lida: boolean;
  lidaEm: Date | null;
  criadoEm: Date;
}

export async function buscarNotificacoes(
  prisma: ClienteListarNotificacoes,
  colaboradorId: string,
  paginacao: { pagina: number; tamanho: number },
): Promise<RespostaPaginada<NotificacaoResposta>> {
  const [itens, total] = await Promise.all([
    prisma.notificacao.findMany({
      where: { colaboradorId },
      orderBy: { criadoEm: 'desc' },
      skip: (paginacao.pagina - 1) * paginacao.tamanho,
      take: paginacao.tamanho,
    }),
    prisma.notificacao.count({ where: { colaboradorId } }),
  ]);

  return { itens, total };
}
