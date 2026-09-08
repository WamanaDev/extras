/**
 * `enviarAlertasDeMedicamento` — job periódico de dose atrasada/parada em
 * separação (FN-014 `alertas_medicamento`, RNP-18, FUND-005 "gerado em até
 * 5 min do horário previsto").
 *
 * Para cada RT ativa, consulta `alertas_medicamento` e notifica (in-app +
 * push best-effort, via `criarNotificacao`) todos os colaboradores ativos
 * daquela RT — qualquer um pode agir (papel único, `FUND-005`). Texto
 * sempre genérico: nunca nome de medicamento, paciente ou etapa detalhada
 * no corpo da notificação (`SEC-SAUDE`, RNP-22) — o link leva para a tela
 * de MAR autenticada, onde o detalhe é esperado.
 *
 * Dedupe por `(colaboradorId, tipo, link)` — mesmo padrão de
 * `lembrete-extra.ts`: link embute `administracaoId`, então o mesmo alerta
 * não duplica notificação a cada execução do cron enquanto a dose seguir
 * parada.
 */
import type { PrismaClient } from '@prisma/client';
import { criarNotificacao, type ClienteNotificacao } from './criar';
import { alertasMedicamento } from '@/server/services/pacientes/medicamentos';

export interface ResultadoAlertasMedicamento {
  rtsVerificadas: number;
  alertas: number;
  notificadas: number;
  jaNotificadas: number;
}

/**
 * `PrismaClient` completo, não um `Pick` estreito como em `lembrete-extra.ts`
 * — `alertasMedicamento` (services/pacientes/medicamentos) já exige o
 * client inteiro para `$queryRaw` da função SQL `alertas_medicamento`.
 */
export async function enviarAlertasDeMedicamento(prisma: PrismaClient & ClienteNotificacao): Promise<ResultadoAlertasMedicamento> {
  const rts = await prisma.rt.findMany({ where: { ativo: true }, select: { id: true } });

  let alertasTotal = 0;
  let notificadas = 0;
  let jaNotificadas = 0;

  for (const rt of rts) {
    const alertas = await alertasMedicamento(prisma, rt.id, 30);
    if (alertas.length === 0) continue;
    alertasTotal += alertas.length;

    const colaboradores = await prisma.colaborador.findMany({ where: { rtId: rt.id, ativo: true }, select: { id: true } });
    if (colaboradores.length === 0) continue;

    for (const alerta of alertas) {
      const link = `/pacientes/${alerta.pacienteId}/medicamentos?administracaoId=${alerta.administracaoId}`;

      for (const colaborador of colaboradores) {
        const existente = await prisma.notificacao.findFirst({
          where: { colaboradorId: colaborador.id, tipo: 'ALERTA_MEDICACAO', link },
        });
        if (existente) {
          jaNotificadas += 1;
          continue;
        }

        await criarNotificacao(prisma, {
          colaboradorId: colaborador.id,
          tipo: 'ALERTA_MEDICACAO',
          titulo: 'Pendência de medicação',
          mensagem: 'Há uma dose aguardando atenção na sua RT.',
          link,
        });
        notificadas += 1;
      }
    }
  }

  return { rtsVerificadas: rts.length, alertas: alertasTotal, notificadas, jaNotificadas };
}
