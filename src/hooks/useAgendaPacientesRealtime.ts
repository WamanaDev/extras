'use client';

/**
 * RT-003 (`specs/05-realtime/canais-pacientes.md`) — metade de frontend.
 * Assina `rt:{rtId}:pacientes` e chama `onEvento` (debounce 500ms) para
 * qualquer evento de agendamento ou medicação — o consumidor refaz o fetch
 * (API-AGE-001/API-MED-006/007), nunca recalcula localmente quem pode
 * conferir/administrar (RNP-26/27, "Regra de refetch").
 *
 * Versão simplificada de `usePlantoesRealtime` (RT-001/RT-002): mesmo
 * debounce e mesma reconexão com backoff, sem a máquina de estados
 * `DEGRADADO`/polling — este módulo não tem uma grade de contenção de pico
 * (abertura de janela) para justificar a mesma robustez; falha de
 * reconexão aqui só atrasa um refetch, nunca bloqueia uma ação do
 * colaborador (a API sempre decide de novo na próxima chamada).
 */
import { useEffect, useRef } from 'react';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { env } from '@/env';

const DEBOUNCE_MS = 500;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_TETO_MS = 30000;

const EVENTOS = [
  'agendamento:criado',
  'agendamento:atualizado',
  'agendamento:cancelado',
  'medicacao:separada',
  'medicacao:conferida',
  'medicacao:divergente',
  'medicacao:administrada',
] as const;

export function useAgendaPacientesRealtime(rtId: string | null | undefined, onEvento: () => void): void {
  const onEventoRef = useRef(onEvento);
  onEventoRef.current = onEvento;

  useEffect(() => {
    if (!rtId) return;

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    let destruido = false;
    let canal: RealtimeChannel | null = null;
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    let reconexaoId: ReturnType<typeof setTimeout> | null = null;
    let falhasSeguidas = 0;

    const dispararComDebounce = (): void => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(() => onEventoRef.current(), DEBOUNCE_MS);
    };

    const removerCanalAtual = (): void => {
      if (canal) {
        void supabase.removeChannel(canal);
        canal = null;
      }
    };

    const agendarReconexao = (): void => {
      if (reconexaoId) clearTimeout(reconexaoId);
      const atraso = Math.min(BACKOFF_BASE_MS * 2 ** falhasSeguidas, BACKOFF_TETO_MS);
      falhasSeguidas += 1;
      reconexaoId = setTimeout(() => {
        if (destruido) return;
        removerCanalAtual();
        conectar();
      }, atraso);
    };

    function conectar(): void {
      let builder = supabase.channel(`rt:${rtId}:pacientes`);
      for (const evento of EVENTOS) {
        builder = builder.on('broadcast', { event: evento }, dispararComDebounce);
      }
      canal = builder.subscribe((status: string) => {
        if (destruido) return;
        if (status === 'SUBSCRIBED') {
          if (falhasSeguidas > 0) {
            falhasSeguidas = 0;
            onEventoRef.current(); // reconectou depois de cair — refetch completo, sem debounce.
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          agendarReconexao();
        }
      });
    }

    conectar();

    return () => {
      destruido = true;
      if (debounceId) clearTimeout(debounceId);
      if (reconexaoId) clearTimeout(reconexaoId);
      removerCanalAtual();
    };
  }, [rtId]);
}
