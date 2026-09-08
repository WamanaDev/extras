/**
 * `GET /api/cron/alertas-medicamento` — dispara `enviarAlertasDeMedicamento`
 * (FN-014, RNP-18). Mesmo padrão de autenticação de `/api/cron/lembrete-extra`
 * (segredo compartilhado `CRON_SECRET`, fora do pipeline de `defineHandler`
 * — não é ator autenticado por sessão).
 *
 * **Temporariamente sem agendamento** (removida de `vercel.json` — decisão do
 * usuário): o Vercel Cron do plano Hobby só aceita frequência diária, mas
 * FUND-005 exige "alerta de dose atrasada em até 5 min do horário previsto"
 * — rodar 1x/dia descaracterizaria a funcionalidade, então preferiu desligar
 * por enquanto a rodar errado. A rota continua funcional e autenticada por
 * `CRON_SECRET`, pronta pra ser chamada por qualquer scheduler externo assim
 * que uma opção for escolhida (Supabase pg_cron, GitHub Actions agendado, ou
 * upgrade pro Vercel Pro) — nenhuma mudança de código necessária, só religar
 * o agendamento.
 *
 * Autenticação (rate limit por IP + comparação em tempo constante) em
 * `src/server/http/cron-auth.ts` — reforçado a pedido do usuário: o
 * scheduler vai ser um workflow do GitHub Actions num repositório público
 * (`.yml` com a URL/horário visível, só `CRON_SECRET` mascarado pelo
 * GitHub), então vale a defesa extra contra tentativa de adivinhar o
 * segredo por força bruta.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { obterPrisma } from '@/server/db/client';
import { redigirParaLog } from '@/server/log/redact';
import { autorizarCron } from '@/server/http/cron-auth';
import { enviarAlertasDeMedicamento } from '@/server/notificacoes/alertas-medicamento';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await autorizarCron(request);
  if (!auth.ok) {
    const headers = auth.retryAfter !== undefined ? { 'Retry-After': String(auth.retryAfter) } : undefined;
    return NextResponse.json({ erro: auth.status === 429 ? 'LIMITE_EXCEDIDO' : 'NAO_AUTENTICADO', mensagem: auth.mensagem }, { status: auth.status, ...(headers ? { headers } : {}) });
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
