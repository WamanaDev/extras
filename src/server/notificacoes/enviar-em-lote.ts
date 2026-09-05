/**
 * `enviarNotificacaoEmLote` — admin escolhe colaboradores + escreve o
 * título/mensagem, e cada um recebe uma notificação (in-app + tentativa de
 * push best-effort) via `criarNotificacao` (mesmo ponto de entrada que
 * qualquer gatilho de negócio futuro vai usar — ver docstring de `criar.ts`).
 *
 * Só valida que os `colaboradorId` recebidos existem — nenhuma outra regra
 * de negócio (não é um evento do domínio, é um envio manual do admin).
 */
import type { PrismaClient } from '@prisma/client';
import { criarNotificacao, type ClienteNotificacao } from './criar';

export type ClienteEnviarEmLote = Pick<PrismaClient, 'colaborador'> & ClienteNotificacao;

export interface EntradaEnviarEmLote {
  colaboradorIds: string[];
  titulo: string;
  mensagem: string;
  link?: string;
}

export interface ResultadoEnviarEmLote {
  enviadas: number;
  colaboradorIds: string[];
}

export async function enviarNotificacaoEmLote(
  prisma: ClienteEnviarEmLote,
  entrada: EntradaEnviarEmLote,
): Promise<ResultadoEnviarEmLote> {
  const idsUnicos = Array.from(new Set(entrada.colaboradorIds));

  const existentes = await prisma.colaborador.findMany({
    where: { id: { in: idsUnicos } },
    select: { id: true },
  });
  const idsValidos = existentes.map((c) => c.id);

  for (const colaboradorId of idsValidos) {
    await criarNotificacao(prisma, {
      colaboradorId,
      tipo: 'ADMIN_MANUAL',
      titulo: entrada.titulo,
      mensagem: entrada.mensagem,
      ...(entrada.link !== undefined ? { link: entrada.link } : {}),
    });
  }

  return { enviadas: idsValidos.length, colaboradorIds: idsValidos };
}
