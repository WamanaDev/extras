/**
 * `sincronizarGoogleCalendar` — pedido do usuário: botão que marca todo o
 * ciclo (dias em que a pessoa TRABALHA — não os de folga, que não têm
 * utilidade numa agenda pessoal) + extras confirmadas na agenda Google do
 * colaborador.
 *
 * Idempotente: cada evento usa um id determinístico (`idEventoEscala`/
 * `idEventoExtra`, a partir do id da linha no banco) — sincronizar de novo
 * (novo dia trabalhado, nova extra) nunca duplica os eventos já criados,
 * `upsertEvento` (`google-calendar.ts`) resolve create-ou-update sozinho.
 *
 * `inicioEm`/`fimEm` de `escala_dia`/`marcacao` já vêm calculados por
 * trigger (`preencher_intervalo`/`copiar_intervalo_marcacao`, DB-003) — não
 * reimplementa esse cálculo aqui, só usa o valor pronto.
 */
import type { PrismaClient } from '@prisma/client';
import { obterAccessToken, upsertEvento, idEventoEscala, idEventoExtra } from '@/server/integracoes/google-calendar';

export type ClienteSincronizarGoogleCalendar = Pick<PrismaClient, 'googleCalendarConta' | 'escalaDia' | 'marcacao'>;

export interface ResultadoSincronizacao {
  eventosEscala: number;
  eventosExtra: number;
}

/** Lançado quando o colaborador ainda não conectou a conta Google — a rota traduz isso numa mensagem clara, não um erro genérico. */
export class GoogleCalendarNaoConectadoError extends Error {
  constructor() {
    super('Conecte sua conta do Google Calendar antes de sincronizar.');
    this.name = 'GoogleCalendarNaoConectadoError';
  }
}

export async function sincronizarGoogleCalendar(
  prisma: ClienteSincronizarGoogleCalendar,
  colaboradorId: string,
  cicloId: string,
): Promise<ResultadoSincronizacao> {
  const conta = await prisma.googleCalendarConta.findUnique({ where: { colaboradorId } });
  if (!conta) throw new GoogleCalendarNaoConectadoError();

  const accessToken = await obterAccessToken(conta.refreshTokenCifrado);

  const diasTrabalhados = await prisma.escalaDia.findMany({
    where: { colaboradorId, cicloId, codigoEscala: { presenca: true } },
    select: { id: true, inicioEm: true, fimEm: true, codigoEscala: { select: { descricao: true } } },
  });

  for (const dia of diasTrabalhados) {
    await upsertEvento({
      accessToken,
      calendarioId: conta.calendarioId,
      evento: {
        id: idEventoEscala(dia.id),
        titulo: 'Plantão — Escala 12x36',
        descricao: dia.codigoEscala.descricao,
        inicioIso: dia.inicioEm.toISOString(),
        fimIso: dia.fimEm.toISOString(),
      },
    });
  }

  const extras = await prisma.marcacao.findMany({
    where: { colaboradorId, status: 'CONFIRMADA', plantao: { cicloId } },
    select: { id: true, inicioEm: true, fimEm: true, plantao: { select: { rt: { select: { nome: true } } } } },
  });

  for (const extra of extras) {
    await upsertEvento({
      accessToken,
      calendarioId: conta.calendarioId,
      evento: {
        id: idEventoExtra(extra.id),
        titulo: `Extra confirmada — RT ${extra.plantao.rt.nome}`,
        inicioIso: extra.inicioEm.toISOString(),
        fimIso: extra.fimEm.toISOString(),
      },
    });
  }

  await prisma.googleCalendarConta.update({ where: { colaboradorId }, data: { atualizadoEm: new Date() } });

  return { eventosEscala: diasTrabalhados.length, eventosExtra: extras.length };
}
