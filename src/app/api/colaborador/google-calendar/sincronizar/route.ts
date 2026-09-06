/**
 * `POST /api/colaborador/google-calendar/sincronizar` — marca os dias
 * trabalhados do ciclo + extras confirmadas na agenda Google já conectada
 * (pedido do usuário). Ver `google-calendar-sincronizar.ts` pra regra de
 * negócio.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { erroDeNegocio } from '@/server/http/erros';
import { obterPrisma } from '@/server/db/client';
import { redigirParaLog } from '@/server/log/redact';
import { sincronizarGoogleCalendar, GoogleCalendarNaoConectadoError } from '@/server/services/colaborador/google-calendar-sincronizar';

const BodySchema = z.object({ cicloId: z.string().uuid() });

export const POST = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: {
    escopo: 'leitura_por_sessao',
    identificador: ({ request }) => request.cookies.get('sessao_colaborador')?.value ?? 'anon',
  },
  body: BodySchema,
  handler: async ({ ator, body }) => {
    const prisma = await obterPrisma();
    try {
      return await sincronizarGoogleCalendar(prisma, ator.colaboradorId, body.cicloId);
    } catch (erro) {
      if (erro instanceof GoogleCalendarNaoConectadoError) {
        throw erroDeNegocio(erro.message, 'REGRA_DE_NEGOCIO');
      }
      // eslint-disable-next-line no-console
      console.error(redigirParaLog({ msg: 'falha ao sincronizar Google Calendar', colaboradorId: ator.colaboradorId, erro: String(erro) }));
      throw erroDeNegocio('Não foi possível sincronizar com o Google Calendar agora. Tente novamente em instantes.', 'REGRA_DE_NEGOCIO');
    }
  },
});
