'use client';

/**
 * `usePlantoesRealtime` — metade de frontend do entregável de RT-001
 * (`specs/05-realtime/canais.md`). A metade de servidor (`broadcast()`) já
 * existia (`src/server/realtime/broadcast.ts`, ver `_conflitos.md`, nota no
 * topo daquele arquivo, que registra explicitamente este hook como pendente
 * — "peça de frontend, fora até do que API-COL-004/005 precisam para
 * fechar"). Criado aqui porque `/(colaborador)/plantoes` (FE-001, mapa de
 * páginas) exige "grade de extras, realtime" e nenhum outro agente desta
 * onda tem `06-frontend`/`05-realtime` no próprio escopo.
 *
 * Assina o canal `ciclo:{cicloId}` e, para qualquer evento relevante
 * (mudança em `plantao` via Postgres Changes, ou broadcast
 * `marcacao:criada`/`marcacao:cancelada`), chama `onEvento` — que o
 * consumidor usa para refazer o fetch de `API-COL-003` (RT-001, "Regra de
 * refetch": o cliente nunca recalcula localmente quem ainda tem vaga).
 * Debounce de 500 ms (RT-6: 10 eventos em 1s → um único refetch).
 *
 * Usa a `anon key` pública (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) — o mesmo
 * motivo de `canais.md`, "Por que só `plantao` em Postgres Changes": só
 * `plantao` (sem dado pessoal) é lido direto do navegador sob RLS.
 *
 * RT-002 (`specs/05-realtime/fallback.md`) — máquina de estados de conexão,
 * adicionada aqui em vez de um segundo hook porque este já é o único
 * consumidor de Realtime do frontend (ver `fallback.md`, "Decida a forma de
 * integrar"). Estados expostos em `estadoConexao`:
 *
 *   CONECTANDO → CONECTADO → (queda) → RECONECTANDO → CONECTADO
 *                                           ↓ (3 falhas)
 *                                       DEGRADADO (polling 15s)
 *
 * RT-002.1: backoff exponencial 1s/2s/4s/8s, teto 30s (`agendarReconexao`).
 * RT-002.2: 3 falhas seguidas → DEGRADADO, liga polling de 15s.
 * RT-002.3: `estadoConexao === 'DEGRADADO'` é só o estado — o texto/visual
 * do banner ("atualizando em modo lento") é decisão de quem consome o hook,
 * não deste módulo (spec de UI é `06-frontend/*`, fora daqui).
 * RT-002.4: ao reconectar (de RECONECTANDO ou DEGRADADO para CONECTADO),
 * dispara `onEvento` sem debounce — refetch completo, nunca assume que
 * eventos perdidos durante a queda foram recuperados (Supabase Realtime não
 * garante entrega de eventos ocorridos durante desconexão).
 * RT-002.5: aba em background (`visibilitychange`) reduz o polling de
 * DEGRADADO para 60s; ao voltar ao foco, refetch imediato (sem debounce) e
 * o polling volta a 15s se ainda estiver degradado.
 * RT-002.6 — a regra mais importante: este hook só dispara `onEvento`
 * (um gatilho de refetch). Ele nunca expõe nada que bloqueie ou module a
 * chamada HTTP de marcar/cancelar extra — essas chamadas
 * (`src/components/plantoes/GradePlantoes.tsx`) são diretas, via
 * `chamarApi`, e não leem `estadoConexao`. Realtime indisponível nunca
 * impede marcar extra porque o botão de marcar simplesmente não depende
 * deste hook para nada além de saber quando refazer o `GET`.
 */
import { useEffect, useRef, useState } from 'react';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { env } from '@/env';

const DEBOUNCE_MS = 500;
const LIMITE_FALHAS_PARA_DEGRADADO = 3;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_TETO_MS = 30000;
const POLLING_DEGRADADO_MS = 15000;
const POLLING_BACKGROUND_MS = 60000;

export type EstadoConexaoRealtime = 'CONECTANDO' | 'CONECTADO' | 'RECONECTANDO' | 'DEGRADADO';

export interface ResultadoPlantoesRealtime {
  /** RT-002: estado da conexão realtime, para o consumidor decidir a UI (ex.: banner "atualizando em modo lento" quando `DEGRADADO`). */
  estadoConexao: EstadoConexaoRealtime;
}

export function usePlantoesRealtime(cicloId: string | null | undefined, onEvento: () => void): ResultadoPlantoesRealtime {
  const onEventoRef = useRef(onEvento);
  onEventoRef.current = onEvento;

  const [estadoConexao, setEstadoConexao] = useState<EstadoConexaoRealtime>('CONECTANDO');

  useEffect(() => {
    if (!cicloId) return;

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    let destruido = false;
    let canal: RealtimeChannel | null = null;
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    let reconexaoId: ReturnType<typeof setTimeout> | null = null;
    let pollingId: ReturnType<typeof setInterval> | null = null;
    let falhasSeguidas = 0;
    let emDegradado = false;

    const definirEstado = (novo: EstadoConexaoRealtime): void => {
      if (!destruido) setEstadoConexao(novo);
    };

    const pararPolling = (): void => {
      if (pollingId) {
        clearInterval(pollingId);
        pollingId = null;
      }
    };

    const iniciarPolling = (intervaloMs: number): void => {
      pararPolling();
      pollingId = setInterval(() => onEventoRef.current(), intervaloMs);
    };

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

    // RT-002.1: 1s, 2s, 4s, 8s, teto de 30s.
    const agendarReconexao = (): void => {
      if (reconexaoId) clearTimeout(reconexaoId);
      const atraso = Math.min(BACKOFF_BASE_MS * 2 ** (falhasSeguidas - 1), BACKOFF_TETO_MS);
      reconexaoId = setTimeout(() => {
        if (destruido) return;
        removerCanalAtual();
        conectar();
      }, atraso);
    };

    const lidarComFalha = (): void => {
      falhasSeguidas += 1;
      if (falhasSeguidas >= LIMITE_FALHAS_PARA_DEGRADADO) {
        // RT-002.2: 3 falhas → DEGRADADO, liga polling (15s em foco, 60s em background — RT-002.5).
        if (!emDegradado) {
          emDegradado = true;
          definirEstado('DEGRADADO');
          const emBackground = typeof document !== 'undefined' && document.visibilityState === 'hidden';
          iniciarPolling(emBackground ? POLLING_BACKGROUND_MS : POLLING_DEGRADADO_MS);
        }
      } else {
        definirEstado('RECONECTANDO');
      }
      agendarReconexao();
    };

    const lidarComSucesso = (): void => {
      const precisaRefetchCompleto = falhasSeguidas > 0 || emDegradado;
      falhasSeguidas = 0;
      if (reconexaoId) {
        clearTimeout(reconexaoId);
        reconexaoId = null;
      }
      if (emDegradado) {
        emDegradado = false;
        pararPolling();
      }
      definirEstado('CONECTADO');
      // RT-002.4: refetch completo ao reconectar, nunca debounced — eventos
      // perdidos durante a queda não são recuperáveis.
      if (precisaRefetchCompleto) onEventoRef.current();
    };

    function conectar(): void {
      canal = supabase
        .channel(`ciclo:${cicloId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'plantao' }, dispararComDebounce)
        .on('broadcast', { event: 'marcacao:criada' }, dispararComDebounce)
        .on('broadcast', { event: 'marcacao:cancelada' }, dispararComDebounce)
        .subscribe((status: string) => {
          if (destruido) return;
          if (status === 'SUBSCRIBED') {
            lidarComSucesso();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            lidarComFalha();
          }
        });
    }

    // RT-002.5: aba volta ao foco → refetch imediato e polling de volta a 15s
    // (se ainda degradado); aba vai para background → polling cai a 60s.
    const aoMudarVisibilidade = (): void => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') {
        onEventoRef.current();
        if (emDegradado) iniciarPolling(POLLING_DEGRADADO_MS);
      } else if (emDegradado) {
        iniciarPolling(POLLING_BACKGROUND_MS);
      }
    };

    conectar();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', aoMudarVisibilidade);
    }

    return () => {
      destruido = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      }
      if (debounceId) clearTimeout(debounceId);
      if (reconexaoId) clearTimeout(reconexaoId);
      pararPolling();
      removerCanalAtual();
    };
  }, [cicloId]);

  return { estadoConexao };
}
