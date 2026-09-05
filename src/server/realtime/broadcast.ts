/**
 * RT-001 — `broadcast()`, implementação mínima.
 *
 * **Entregável formal de `specs/05-realtime/canais.md` (RT-001), não de
 * `specs/04-api/colaborador/*`.** Registrado em `_conflitos.md`: implementado
 * aqui, fora do próprio escopo desta rodada de agentes (`04-api/colaborador`),
 * porque `API-COL-004-marcar.md` e `API-COL-005-cancelar.md` (ambas `PRONTA`,
 * escopo real deste agente) exigem literalmente, no próprio "Fluxo": "Depois
 * do commit: broadcast `marcacao:criada`/`marcacao:cancelada` no canal do
 * ciclo" — e nenhum outro agente desta onda tem `05-realtime/*` no próprio
 * escopo (`specs/04-api/*`, oito pastas, não inclui `05-realtime`). Sem este
 * módulo, `API-COL-004`/`API-COL-005` — ambas `PRONTA` — ficariam
 * impossíveis de fechar o "Definição de pronto" de `AGENTS.md`. Implementação
 * deliberadamente mínima: só o que os testes 8 (marcar) e o fluxo de cancelar
 * exigem (emitir depois do commit, nunca dentro da transação — `SEC-ACID`).
 * `src/hooks/usePlantoesRealtime.ts` (a outra metade do entregável de
 * RT-001) **não** foi criado — é peça de frontend, fora até do que
 * `API-COL-004`/`005` precisam para fechar. Quem pegar `RT-001` formalmente
 * deve revisar este arquivo, não redescobrir do zero.
 *
 * Canal `ciclo:{cicloId}` (RT-001, seção "Canal"). Eventos usados por este
 * agente: `marcacao:criada` (payload público `{ plantaoId }` para todos +
 * privado `{ plantaoId, marcacaoId }` só para o autor — RT-001 documenta os
 * dois; como Supabase Broadcast não filtra por assinante no servidor, e o
 * canal `ciclo:{cicloId}` é compartilhado, este módulo emite só o payload
 * público — o autor já tem `marcacaoId` na própria resposta HTTP 201, não
 * precisa dele de volta por Realtime) e `marcacao:cancelada` (`{ plantaoId
 * }`). RT-3: nenhum payload deste módulo contém `colaboradorId`.
 *
 * `SEC-ACID`/RT-001 "Broadcast só após commit": esta função nunca é chamada
 * de dentro de `emTransacao` — é responsabilidade de quem chama (as rotas
 * `API-COL-004`/`005`) invocá-la só depois do `await emTransacao(...)`
 * resolver. Falha de broadcast é best-effort: um evento perdido é pior que
 * atrasado, nunca pior que a mutação já commitada falhar por causa dele — por
 * isso captura e loga (nunca relança) qualquer erro de rede/Supabase.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { redigirParaLog } from '@/server/log/redact';
import { env } from '@/env';

export type EventoRealtime = 'marcacao:criada' | 'marcacao:cancelada' | 'escala:atualizada' | 'ciclo:atualizado';

export interface PayloadMarcacaoCriada {
  plantaoId: string;
}

export interface PayloadMarcacaoCancelada {
  plantaoId: string;
}

let clienteSingleton: SupabaseClient | null = null;
function clientePadrao(): SupabaseClient {
  clienteSingleton ??= createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return clienteSingleton;
}

/**
 * Emite um evento de Broadcast no canal `ciclo:{cicloId}`. Nunca lança —
 * best-effort, chamado só depois do commit (ver docstring do arquivo).
 */
export async function broadcast(
  cicloId: string,
  evento: EventoRealtime,
  payload: PayloadMarcacaoCriada | PayloadMarcacaoCancelada | Record<string, unknown>,
  cliente: SupabaseClient = clientePadrao(),
): Promise<void> {
  try {
    const canal = cliente.channel(`ciclo:${cicloId}`);
    await canal.send({ type: 'broadcast', event: evento, payload });
    await cliente.removeChannel(canal);
  } catch (erro) {
    // eslint-disable-next-line no-console
    console.error(redigirParaLog({ msg: 'falha ao emitir broadcast realtime', cicloId, evento, erro: String(erro) }));
  }
}
