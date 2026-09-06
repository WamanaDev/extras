'use client';

/**
 * Botão de sincronização com o Google Calendar (pedido do usuário) —
 * `/api/colaborador/google-calendar/*`. Compartilhado por `/minha-escala` e
 * `/minha-escala-calendario` (mesma tela, apresentação diferente — pedido do
 * usuário de colocar o botão nas duas).
 *
 * "Conectar" é uma navegação de verdade (`<a href>`, não `fetch`) porque o
 * fluxo OAuth precisa de redirects de página inteira; "Sincronizar"/
 * "Desconectar" são chamadas normais via `@/lib/api/client`.
 */
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { del, get, post, type ErroApi } from '@/lib/api/client';
import { Button } from '@/components/ui/button';

interface StatusGoogleCalendar {
  disponivel: boolean;
  conectado: boolean;
}

interface ResultadoSincronizacao {
  eventosEscala: number;
  eventosExtra: number;
}

export function GoogleCalendarBotao({ cicloId }: { cicloId: string }): JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<StatusGoogleCalendar | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [resultado, setResultado] = useState<ResultadoSincronizacao | null>(null);

  async function recarregarStatus(): Promise<void> {
    const resposta = await get<StatusGoogleCalendar>('/api/colaborador/google-calendar');
    if (resposta.ok) setStatus(resposta.dados);
  }

  useEffect(() => {
    void recarregarStatus();
  }, []);

  // Mensagem de retorno do fluxo OAuth (`?googleCalendar=conectado|erro|recusado`) — limpa da URL depois de ler, uma vez só.
  const parametroRetorno = searchParams.get('googleCalendar');
  useEffect(() => {
    if (!parametroRetorno) return;
    void recarregarStatus();
    const url = new URL(window.location.href);
    url.searchParams.delete('googleCalendar');
    router.replace(`${pathname}${url.search}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parametroRetorno]);

  async function sincronizar(): Promise<void> {
    setCarregando(true);
    setErro(null);
    setResultado(null);
    const resposta = await post<ResultadoSincronizacao>('/api/colaborador/google-calendar/sincronizar', { cicloId });
    setCarregando(false);
    if (resposta.ok) setResultado(resposta.dados);
    else setErro(resposta.erro);
  }

  async function desconectar(): Promise<void> {
    setCarregando(true);
    await del('/api/colaborador/google-calendar');
    setCarregando(false);
    setResultado(null);
    await recarregarStatus();
  }

  if (status === null || !status.disponivel) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Google Calendar</h2>

      {parametroRetorno === 'recusado' ? <p className="mt-1 text-sm text-slate-600">Conexão cancelada.</p> : null}
      {parametroRetorno === 'erro' ? <p role="alert" className="mt-1 text-sm text-red-700">Não foi possível conectar. Tente de novo.</p> : null}

      {status.conectado ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button onClick={() => void sincronizar()} disabled={carregando}>
            {carregando ? 'Sincronizando…' : 'Sincronizar escala e extras'}
          </Button>
          <Button variant="outline" onClick={() => void desconectar()} disabled={carregando}>
            Desconectar
          </Button>
        </div>
      ) : (
        <div className="mt-2">
          <p className="mb-2 text-sm text-slate-600">Conecte sua conta Google pra marcar automaticamente os dias de plantão e as extras confirmadas na sua agenda.</p>
          <a href="/api/colaborador/google-calendar/conectar">
            <Button>Conectar Google Calendar</Button>
          </a>
        </div>
      )}

      {resultado ? (
        <p role="status" className="mt-2 text-sm text-emerald-800">
          {resultado.eventosEscala} dia(s) de plantão e {resultado.eventosExtra} extra(s) sincronizados.
        </p>
      ) : null}
      {erro ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {erro.mensagem}
        </p>
      ) : null}
    </section>
  );
}
