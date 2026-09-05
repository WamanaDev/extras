'use client';

/**
 * `usePushNotifications` — metade de frontend da infra de Web Push (preparação;
 * ver `src/server/notificacoes/push.ts`: nenhum push real ainda, faltam as
 * chaves VAPID em produção e os gatilhos de negócio chamando `criarNotificacao`).
 *
 * `ativar()` só deve ser chamado a partir de um clique do usuário — a
 * Notification Permission API exige gesto do usuário; chamar isso sozinho no
 * mount de um componente é ignorado silenciosamente pelo browser (ou pior,
 * marca a origem como "sempre nega" em alguns navegadores). Por isso este
 * hook nunca pede permissão sozinho, só expõe a função.
 *
 * `suportado` é `false` sempre que faltar Service Worker, Push API, ou a
 * chave pública VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`) — ou seja, hoje,
 * antes de configurar as chaves, a feature fica desligada de propósito.
 *
 * `contextoSeguro` (`window.isSecureContext`) é checado à parte: Service
 * Worker/Push só funcionam em HTTPS (ou na exceção especial de `localhost`)
 * — um IP da rede local acessado por HTTP puro (ex.: testar pelo celular
 * sem TLS) `'serviceWorker' in navigator` continua `true` (é só detecção de
 * API, não de contexto), mas `navigator.serviceWorker.register(...)` rejeita
 * na hora. Sem essa checagem explícita, o usuário só via um erro genérico
 * de "não foi possível ativar" sem entender por quê (achado em uso real).
 */
import { useCallback, useEffect, useState } from 'react';
import { post, del } from '@/lib/api/client';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export type PermissaoPush = 'default' | 'granted' | 'denied';

export interface ResultadoPushNotifications {
  suportado: boolean;
  /** `false` num contexto não seguro (HTTP fora de `localhost`) — Service Worker/Push exigem HTTPS. */
  contextoSeguro: boolean;
  permissao: PermissaoPush;
  inscrito: boolean;
  ativando: boolean;
  erro: string | null;
  ativar: () => Promise<void>;
  desativar: () => Promise<void>;
}

/** `PushManager.subscribe` exige a chave VAPID como `Uint8Array`, não a string base64url que vem do env. */
function base64UrlParaUint8Array(base64Url: string): Uint8Array {
  const preenchimento = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + preenchimento).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = window.atob(base64);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications(): ResultadoPushNotifications {
  const contextoSeguro = typeof window !== 'undefined' && window.isSecureContext;
  const suportado =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(VAPID_PUBLIC_KEY);

  const [permissao, setPermissao] = useState<PermissaoPush>('default');
  const [inscrito, setInscrito] = useState(false);
  const [ativando, setAtivando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!suportado) return;
    setPermissao(Notification.permission);

    let cancelado = false;
    navigator.serviceWorker
      .getRegistration()
      .then((registro) => registro?.pushManager.getSubscription() ?? null)
      .then((subscription) => {
        if (!cancelado) setInscrito(subscription !== null);
      })
      .catch(() => {
        /* Sem registro/subscription ainda — estado inicial (não inscrito) já cobre isso. */
      });

    return () => {
      cancelado = true;
    };
  }, [suportado]);

  const ativar = useCallback(async (): Promise<void> => {
    if (!suportado || !VAPID_PUBLIC_KEY) return;
    setAtivando(true);
    setErro(null);
    if (!contextoSeguro) {
      setErro('Notificações push exigem HTTPS. Acessando por um IP da rede local sem certificado, o navegador bloqueia o Service Worker — funciona em produção (HTTPS) ou em localhost.');
      setAtivando(false);
      return;
    }
    try {
      const permissaoConcedida = await Notification.requestPermission();
      setPermissao(permissaoConcedida);
      if (permissaoConcedida !== 'granted') {
        setErro('Permissão de notificações negada.');
        return;
      }

      const registro = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlParaUint8Array(VAPID_PUBLIC_KEY),
      });

      const resultado = await post('/api/push/subscribe', subscription.toJSON());
      if (!resultado.ok) {
        setErro(resultado.erro.mensagem);
        return;
      }
      setInscrito(true);
    } catch {
      setErro('Não foi possível ativar as notificações neste navegador.');
    } finally {
      setAtivando(false);
    }
  }, [suportado]);

  const desativar = useCallback(async (): Promise<void> => {
    if (!suportado) return;
    setAtivando(true);
    setErro(null);
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const subscription = await registro?.pushManager.getSubscription();
      if (subscription) {
        await del('/api/push/subscribe', { body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setInscrito(false);
    } catch {
      setErro('Não foi possível desativar as notificações.');
    } finally {
      setAtivando(false);
    }
  }, [suportado]);

  return { suportado, contextoSeguro, permissao, inscrito, ativando, erro, ativar, desativar };
}
