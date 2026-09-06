/**
 * `GET /api/cron/lembrete-extra?turno=DIURNO|NOTURNO` — dispara push +
 * notificação in-app pra quem tem extra confirmada no turno pedido (pedido
 * do usuário: aviso automático de extra confirmada). Ver
 * `src/server/notificacoes/lembrete-extra.ts` pra regra de qual dia cada
 * turno aponta e por que "4 horas antes" não é literal aqui.
 *
 * Chamado por Vercel Cron Jobs (`vercel.json`, `crons`) duas vezes ao dia —
 * `?turno=NOTURNO` às 08:00 BRT (11:00 UTC), `?turno=DIURNO` às 20:00 BRT
 * (23:00 UTC; `America/Sao_Paulo` é UTC-3 fixo, sem horário de verão desde
 * 2019 — mesma constante de `lib/escala/blocos.ts`).
 *
 * Foge do pipeline de `defineHandler` de propósito: não é uma rota chamada
 * por um usuário autenticado (colaborador/admin) — é um webhook interno
 * disparado pela própria plataforma, autenticado por segredo compartilhado
 * (`CRON_SECRET`), não por sessão. Nenhum dos quatro tipos de `ator` do
 * contrato comum (`PUBLICO`/`COLABORADOR`/`ADMIN`/`QUALQUER`) modela isso.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { obterPrisma } from '@/server/db/client';
import { redigirParaLog } from '@/server/log/redact';
import { enviarLembretesDeExtra, type TurnoLembrete } from '@/server/notificacoes/lembrete-extra';

function autorizado(request: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  return request.headers.get('authorization') === `Bearer ${segredo}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!autorizado(request)) {
    return NextResponse.json({ erro: 'NAO_AUTENTICADO', mensagem: 'Token de cron ausente ou inválido.' }, { status: 401 });
  }

  const turnoBruto = request.nextUrl.searchParams.get('turno');
  if (turnoBruto !== 'DIURNO' && turnoBruto !== 'NOTURNO') {
    return NextResponse.json({ erro: 'VALIDACAO', mensagem: 'Query "turno" deve ser DIURNO ou NOTURNO.' }, { status: 422 });
  }
  const turno: TurnoLembrete = turnoBruto;

  try {
    const prisma = await obterPrisma();
    const resultado = await enviarLembretesDeExtra(prisma, turno, new Date());
    return NextResponse.json(resultado, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (erro) {
    // eslint-disable-next-line no-console
    console.error(redigirParaLog({ msg: 'falha ao enviar lembretes de extra', turno, erro: String(erro) }));
    return NextResponse.json({ erro: 'ERRO_INTERNO', mensagem: 'Erro interno. Tente novamente em instantes.' }, { status: 500 });
  }
}
