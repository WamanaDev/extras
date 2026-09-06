/**
 * `GET /api/colaborador/google-calendar` — a conta Google já está conectada?
 * (a UI usa isso pra decidir entre mostrar "Conectar" ou "Sincronizar").
 * `DELETE /api/colaborador/google-calendar` — desconecta (apaga o registro;
 * não revoga o token no lado do Google — a pessoa pode fazer isso em
 * myaccount.google.com/permissions se quiser).
 */
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { googleCalendarConfigurado } from '@/server/integracoes/google-calendar';

export const GET = defineHandler({
  ator: 'COLABORADOR',
  cache: 'pessoal',
  handler: async ({ ator }) => {
    if (!googleCalendarConfigurado()) return { disponivel: false, conectado: false };
    const prisma = await obterPrisma();
    const conta = await prisma.googleCalendarConta.findUnique({ where: { colaboradorId: ator.colaboradorId } });
    return { disponivel: true, conectado: conta !== null };
  },
});

export const DELETE = defineHandler({
  ator: 'COLABORADOR',
  handler: async ({ ator }) => {
    const prisma = await obterPrisma();
    await prisma.googleCalendarConta.deleteMany({ where: { colaboradorId: ator.colaboradorId } });
    return { desconectado: true };
  },
});
