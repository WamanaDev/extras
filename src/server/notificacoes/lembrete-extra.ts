/**
 * `enviarLembretesDeExtra` — aviso automático de extra confirmada, disparado
 * por cron (pedido do usuário: "notificações push sempre 4 horas antes de
 * um dia de extra confirmado... todo dia às 08:00 quem tem extra no dia
 * noturno e 20:00 quem tem extra no dia seguinte diurno").
 *
 * Os horários reais dos turnos (`01-dominio/escala-12x36.md`: diurno
 * [07:00,19:00), noturno [19:00,07:00+1)) dão ~11h de antecedência nos dois
 * casos, não 4h ao pé da letra — "4 horas antes" foi a explicação
 * aproximada do usuário pro motivo do lembrete, não uma regra exata;
 * confirmado em conversa que os dois horários fixos (08:00/20:00) são a
 * regra que vale (`_conflitos.md`).
 *
 * Cada turno aponta pro dia certo, sempre (regra fixa, não calculada a
 * partir de "4 horas"):
 * - `NOTURNO` → HOJE (o job roda de manhã, 08:00, pro plantão que começa à
 *   noite do mesmo dia).
 * - `DIURNO` → AMANHÃ (o job roda à noite, 20:00, pro plantão que começa de
 *   manhã do dia seguinte).
 *
 * Dedupe: antes de criar, verifica se já existe uma notificação deste tipo
 * com o mesmo `link` (que embute o id da marcação) pro mesmo colaborador —
 * evita duplicar caso o cron dispare mais de uma vez no mesmo dia (retry da
 * plataforma, reexecução manual). Não é uma constraint de banco (não vale a
 * complexidade de uma migration só pra isso); é best-effort, na mesma
 * filosofia de `push.ts`/`criar.ts`.
 */
import type { PrismaClient } from '@prisma/client';
import { criarNotificacao, type ClienteNotificacao } from './criar';

export type ClienteLembreteExtra = Pick<PrismaClient, 'marcacao' | 'notificacao'> & ClienteNotificacao;

export type TurnoLembrete = 'DIURNO' | 'NOTURNO';

const HORA_INICIO_TURNO: Record<TurnoLembrete, string> = { DIURNO: '07:00', NOTURNO: '19:00' };
const DESCRICAO_DIA: Record<TurnoLembrete, string> = { DIURNO: 'amanhã', NOTURNO: 'hoje' };
/** `DIURNO` avisa pro dia seguinte; `NOTURNO` avisa pro mesmo dia — ver doc-comment do módulo. */
const DIAS_OFFSET_TURNO: Record<TurnoLembrete, number> = { DIURNO: 1, NOTURNO: 0 };

export interface ResultadoLembreteExtra {
  turno: TurnoLembrete;
  dataAlvo: string;
  notificadas: number;
  jaNotificadas: number;
}

/** Data civil (America/Sao_Paulo, via `TZ` — `src/env.ts`) de "hoje + `diasOffset`", como UTC-meia-noite — mesma convenção de `escala_dia.data` usada em todo o resto do módulo de escala. */
function dataCivilUtc(referencia: Date, diasOffset: number): Date {
  return new Date(Date.UTC(referencia.getFullYear(), referencia.getMonth(), referencia.getDate() + diasOffset));
}

export async function enviarLembretesDeExtra(
  prisma: ClienteLembreteExtra,
  turno: TurnoLembrete,
  agora: Date,
): Promise<ResultadoLembreteExtra> {
  const dataAlvo = dataCivilUtc(agora, DIAS_OFFSET_TURNO[turno]);

  const marcacoes = await prisma.marcacao.findMany({
    where: { status: 'CONFIRMADA', plantao: { data: dataAlvo, tipo: turno } },
    select: { id: true, colaboradorId: true, plantao: { select: { rt: { select: { nome: true } } } } },
  });

  let notificadas = 0;
  let jaNotificadas = 0;

  for (const marcacao of marcacoes) {
    const link = `/minhas-extras?marcacaoId=${marcacao.id}`;
    const existente = await prisma.notificacao.findFirst({
      where: { colaboradorId: marcacao.colaboradorId, tipo: 'LEMBRETE_EXTRA', link },
      select: { id: true },
    });
    if (existente) {
      jaNotificadas += 1;
      continue;
    }

    await criarNotificacao(prisma, {
      colaboradorId: marcacao.colaboradorId,
      tipo: 'LEMBRETE_EXTRA',
      titulo: 'Lembrete de extra',
      mensagem: `Você tem uma extra confirmada ${DESCRICAO_DIA[turno]} às ${HORA_INICIO_TURNO[turno]} (RT ${marcacao.plantao.rt.nome}).`,
      link,
    });
    notificadas += 1;
  }

  return { turno, dataAlvo: dataAlvo.toISOString().slice(0, 10), notificadas, jaNotificadas };
}
