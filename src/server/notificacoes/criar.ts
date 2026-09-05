/**
 * `criarNotificacao` — ponto de entrada único para gerar uma notificação
 * in-app (+ tentativa de push best-effort).
 *
 * **Preparação de infra.** Nenhuma feature de negócio chama esta função
 * ainda — nova extra disponível, escala publicada, etc. são gatilhos de uma
 * etapa futura. Este módulo só deixa a base pronta e testável: quando esses
 * gatilhos existirem, eles chamam `criarNotificacao({ colaboradorId, tipo,
 * titulo, mensagem, link })` e pronto.
 *
 * Falha de push nunca falha a criação da notificação — `enviarPushParaColaborador`
 * já é best-effort por si só (nunca lança), mas o `await` aqui é isolado
 * mesmo assim para deixar essa garantia explícita e resiliente a qualquer
 * mudança futura em `push.ts`.
 */
import type { PrismaClient } from '@prisma/client';
import { enviarPushParaColaborador, type ClientePush } from './push';

export type ClienteNotificacao = Pick<PrismaClient, 'notificacao'> & ClientePush;

export interface EntradaCriarNotificacao {
  colaboradorId: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  link?: string;
}

export interface NotificacaoCriada {
  id: string;
  colaboradorId: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  link: string | null;
  lida: boolean;
  criadoEm: Date;
}

export async function criarNotificacao(
  prisma: ClienteNotificacao,
  entrada: EntradaCriarNotificacao,
): Promise<NotificacaoCriada> {
  const notificacao = await prisma.notificacao.create({
    data: {
      colaboradorId: entrada.colaboradorId,
      tipo: entrada.tipo,
      titulo: entrada.titulo,
      mensagem: entrada.mensagem,
      link: entrada.link ?? null,
    },
  });

  // Best-effort — nunca bloqueia nem falha a criação da notificação (ver docstring do arquivo).
  try {
    await enviarPushParaColaborador(prisma, entrada.colaboradorId, {
      titulo: entrada.titulo,
      mensagem: entrada.mensagem,
      ...(entrada.link !== undefined ? { link: entrada.link } : {}),
    });
  } catch {
    // enviarPushParaColaborador já nunca lança — este catch é só uma segunda
    // rede de segurança caso isso mude no futuro.
  }

  return notificacao;
}
