/**
 * Passo 5 de `API-ADM-PAR-001`/`API-ADM-PAR-002`: `Broadcast ciclo:atualizado`.
 *
 * `specs/05-realtime/canais.md` (RT-001) define o entregável real
 * (`src/server/realtime/broadcast.ts`) — na primeira leitura desta spec ele
 * não existia (agente de `04-api/colaborador` ainda não tinha adiantado a
 * implementação mínima, ver docstring de `../realtime/broadcast.ts`). Agora
 * existe, então este módulo chama `broadcast()` direto em vez do fallback
 * dinâmico — ver `_conflitos.md` para o histórico.
 *
 * `SEC-ACID`/RT-001 "Broadcast só após commit": nunca chamar de dentro de
 * `emTransacao` — só depois que a transação principal já resolveu.
 */
import { broadcast } from '@/server/realtime/broadcast';

export interface EventoCicloAtualizado {
  cicloId: string;
  campos: string[];
}

export async function emitirCicloAtualizado(evento: EventoCicloAtualizado): Promise<void> {
  await broadcast(evento.cicloId, 'ciclo:atualizado', { cicloId: evento.cicloId, campos: evento.campos });
}
