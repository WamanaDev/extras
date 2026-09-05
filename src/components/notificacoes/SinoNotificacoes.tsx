'use client';

/**
 * `<SinoNotificacoes />` — sino de notificações in-app do colaborador
 * (`GET/POST /api/notificacoes*`), com o botão de ativar push (preparação de
 * infra — `usePushNotifications`) no rodapé do painel.
 *
 * Busca ao montar e toda vez que o painel abre (nunca em polling — sem
 * realtime aqui de propósito; abrir o sino já é o gesto de "quero ver
 * agora").
 *
 * O painel é renderizado via `createPortal` direto em `document.body` — não
 * basta `z-index` alto: `<header>` (`NavColaborador.tsx`) usa `backdrop-blur`,
 * que cria um novo *stacking context* em CSS, e isso prendia o painel dentro
 * do nível de empilhamento do header (que fica abaixo da barra de navegação
 * fixa do rodapé mesmo com `z-20 > z-10` — os dois números só são comparáveis
 * dentro do mesmo contexto). Portal escapa de qualquer `filter`/`transform`/
 * `backdrop-filter` de ancestral, garantindo que o painel sempre sobreponha
 * tudo. Achado em uso real no celular.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, BellRing, X } from 'lucide-react';
import { getLista, post } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  link: string | null;
  lida: boolean;
  lidaEm: string | null;
  criadoEm: string;
}

function tempoRelativo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutos = Math.floor(diffMs / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos}min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias}d`;
}

export function SinoNotificacoes(): JSX.Element {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<Notificacao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const push = usePushNotifications();

  const naoLidas = itens.filter((n) => !n.lida).length;

  async function buscar(): Promise<void> {
    setCarregando(true);
    setErro(null);
    const resultado = await getLista<Notificacao>('/api/notificacoes?tamanho=20');
    if (resultado.ok) {
      setItens(resultado.dados.itens);
    } else {
      setErro(resultado.erro.mensagem);
    }
    setCarregando(false);
  }

  useEffect(() => {
    void buscar();
  }, []);

  useEffect(() => {
    if (aberto) void buscar();
  }, [aberto]);

  useEffect(() => {
    // `painelRef` (portaled pra `document.body`) e `botaoRef` (o sino, no
    // header) são subárvores DOM separadas agora — precisa checar as duas,
    // senão clicar no próprio botão pra abrir/fechar conta como "fora".
    function aoClicarFora(evento: MouseEvent): void {
      const alvo = evento.target as Node;
      if (painelRef.current?.contains(alvo)) return;
      if (botaoRef.current?.contains(alvo)) return;
      setAberto(false);
    }
    if (aberto) document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto]);

  async function marcarLida(id: string): Promise<void> {
    setItens((atual) => atual.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    await post(`/api/notificacoes/${id}/marcar-lida`);
  }

  async function marcarTodasLidas(): Promise<void> {
    setItens((atual) => atual.map((n) => ({ ...n, lida: true })));
    await post('/api/notificacoes/marcar-todas-lidas');
  }

  return (
    <div className="relative">
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={`Notificações${naoLidas > 0 ? ` — ${naoLidas} não lida(s)` : ''}`}
        aria-expanded={aberto}
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {naoLidas > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        ) : null}
      </button>

      {aberto
        ? createPortal(
            // Mobile-first: no celular o painel ocupa a tela inteira (evita
            // vazar pra fora da viewport perto do canto do sino); a partir de
            // `sm` volta a ser um dropdown ancorado perto do sino no header.
            <div
              ref={painelRef}
              className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:right-4 sm:top-16 sm:w-80 sm:max-w-[90vw] sm:flex-none sm:rounded-lg sm:border sm:border-slate-200 sm:shadow-lg"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span className="text-sm font-semibold text-slate-900">Notificações</span>
                <div className="flex items-center gap-3">
                  {naoLidas > 0 ? (
                    <button
                      type="button"
                      onClick={() => void marcarTodasLidas()}
                      className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Marcar todas como lidas
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setAberto(false)}
                    aria-label="Fechar notificações"
                    className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:hidden"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto sm:max-h-80 sm:flex-none">
                {carregando && itens.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">Carregando…</p>
                ) : erro ? (
                  <p role="alert" className="p-4 text-sm text-red-700">
                    {erro}
                  </p>
                ) : itens.length === 0 ? (
                  <p role="status" className="p-4 text-sm text-slate-500">
                    Nenhuma notificação por aqui.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {itens.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!n.lida) void marcarLida(n.id);
                            if (n.link) window.location.href = n.link;
                          }}
                          className={cn(
                            'block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50',
                            !n.lida && 'bg-slate-50/80',
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className={cn('font-medium text-slate-900', !n.lida && 'font-semibold')}>
                              {n.titulo}
                            </span>
                            {!n.lida ? <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" /> : null}
                          </div>
                          <p className="mt-0.5 text-slate-600">{n.mensagem}</p>
                          <p className="mt-1 text-xs text-slate-400">{tempoRelativo(n.criadoEm)}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {push.suportado ? (
                <div className="border-t border-slate-100 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void (push.inscrito ? push.desativar() : push.ativar())}
                    disabled={push.ativando}
                    className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                  >
                    <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                    {push.ativando ? 'Aguarde…' : push.inscrito ? 'Notificações push ativadas ✓' : 'Ativar notificações push'}
                  </button>
                  {push.erro ? <p className="mt-1 text-xs text-red-700">{push.erro}</p> : null}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
