/**
 * Broadcast best-effort de `escala:atualizada` (`API-ADM-ESC-002`, passo 7;
 * `specs/05-realtime/canais.md`, canal `ciclo:{cicloId}`).
 *
 * `src/server/realtime/broadcast.ts` é o entregável de `RT-001`
 * (`05-realtime/canais.md`), fora do escopo desta tarefa (`admin-escala`) —
 * na Onda 2 ele pode não existir ainda quando esta rota roda, já que os 9
 * agentes desta onda correm em paralelo sem ordem garantida entre si.
 * Registrado em `_conflitos.md` (item 12). Resolução mínima: import
 * dinâmico com fallback silencioso (best-effort, como a própria
 * `canais.md` já pede — "Broadcast só após commit", nunca dentro da
 * transação, e nunca algo que derrube a mutação que já foi commitada com
 * sucesso). Se `RT-001` ainda não existir, ou lançar, a mutação já
 * commitada não é desfeita — só o evento de realtime não sai; a UI cai no
 * fallback de refetch (`05-realtime/fallback.md`).
 */

export interface EventoEscalaAtualizada {
  colaboradorId: string;
  data: string; // YYYY-MM-DD
}

export async function broadcastEscalaAtualizada(cicloId: string, evento: EventoEscalaAtualizada): Promise<void> {
  try {
    const modulo = (await import('@/server/realtime/broadcast').catch(() => null)) as {
      broadcast?: (canal: string, tipo: string, payload: unknown) => Promise<void> | void;
    } | null;
    if (!modulo?.broadcast) return;
    await modulo.broadcast(`ciclo:${cicloId}`, 'escala:atualizada', evento);
  } catch {
    // Best-effort — nunca propaga para a rota (a mutação já foi commitada).
  }
}
