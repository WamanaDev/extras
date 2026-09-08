/**
 * `GET /api/cron/alertas-medicamento` — dispara `enviarAlertasDeMedicamento`
 * (FN-014, RNP-18). Mesmo padrão de autenticação de `/api/cron/lembrete-extra`
 * (segredo compartilhado `CRON_SECRET`, fora do pipeline de `defineHandler`
 * — não é ator autenticado por sessão).
 *
 * Agendado a cada 5 min (`vercel.json`) — FUND-005: "Alerta de dose atrasada
 * gerado em até 5 min do horário previsto".
 */
import { NextResponse, type NextRequest } from 'next/server';
import { obterPrisma } from '@/server/db/client';
import { redigirParaLog } from '@/server/log/redact';
import { enviarAlertasDeMedicamento } from '@/server/notificacoes/alertas-medicamento';

function autorizado(request: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  return request.headers.get('authorization') === `Bearer ${segredo}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!autorizado(request)) {
    return NextResponse.json({ erro: 'NAO_AUTENTICADO', mensagem: 'Token de cron ausente ou inválido.' }, { status: 401 });
  }

  try {
    const prisma = await obterPrisma();
    const resultado = await enviarAlertasDeMedicamento(prisma);
    return NextResponse.json(resultado, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (erro) {
    // eslint-disable-next-line no-console
    console.error(redigirParaLog({ msg: 'falha ao enviar alertas de medicamento', erro: String(erro) }));
    return NextResponse.json({ erro: 'ERRO_INTERNO', mensagem: 'Erro interno. Tente novamente em instantes.' }, { status: 500 });
  }
}
