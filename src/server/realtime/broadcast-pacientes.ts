/**
 * RT-003 (`specs/05-realtime/canais-pacientes.md`) — `broadcastPacientes()`.
 *
 * Mesmo padrão de `./broadcast.ts` (RT-001): best-effort, nunca lança,
 * chamado sempre depois do commit da transação que originou o evento
 * (`SEC-ACID` — nunca dentro de `emTransacao`). Módulo separado (não
 * estende `broadcast.ts`) porque o canal e o catálogo de eventos são
 * diferentes: `rt:{rtId}:pacientes`, não `ciclo:{cicloId}`.
 *
 * Toda tabela deste módulo carrega dado sensível de paciente (`SEC-SAUDE`),
 * diferente de `plantao` — por isso não há Postgres Changes aqui, só
 * Broadcast com payload mínimo (nunca nome de medicamento, condição
 * clínica ou motivo — RNP-22).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { redigirParaLog } from '@/server/log/redact';
import { env } from '@/env';

export type EventoRealtimePacientes =
  | 'agendamento:criado'
  | 'agendamento:atualizado'
  | 'agendamento:cancelado'
  | 'medicacao:separada'
  | 'medicacao:conferida'
  | 'medicacao:divergente'
  | 'medicacao:administrada';

let clienteSingleton: SupabaseClient | null = null;
function clientePadrao(): SupabaseClient {
  clienteSingleton ??= createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return clienteSingleton;
}

/** Emite um evento de Broadcast no canal `rt:{rtId}:pacientes`. Nunca lança. */
export async function broadcastPacientes(
  rtId: string,
  evento: EventoRealtimePacientes,
  payload: Record<string, unknown>,
  cliente: SupabaseClient = clientePadrao(),
): Promise<void> {
  try {
    const canal = cliente.channel(`rt:${rtId}:pacientes`);
    await canal.send({ type: 'broadcast', event: evento, payload });
    await cliente.removeChannel(canal);
  } catch (erro) {
    // eslint-disable-next-line no-console
    console.error(redigirParaLog({ msg: 'falha ao emitir broadcast realtime de pacientes', rtId, evento, erro: String(erro) }));
  }
}
