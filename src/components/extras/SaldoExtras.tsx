'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { get } from '@/lib/api/client';

/**
 * `<SaldoExtras />` — FE-002.
 *
 * Barra `usadas / limite` (`API-COL-007 /api/meu-saldo`). Realtime é
 * responsabilidade de quem monta a página (05-realtime, fora do escopo
 * desta spec) — este componente só reage: aceita `saldo` controlado (o
 * dono da página passa o valor mais recente vindo do canal) ou, na
 * ausência dele, busca sozinho e se atualiza quando `revalidarChave` muda.
 *
 * Ao chegar no limite, a regra é explicar por quê as ações estão
 * desabilitadas, nunca desabilitar em silêncio.
 */
export interface SaldoExtrasDados {
  limite: number;
  usadas: number;
  restantes: number;
  permiteCruzada: boolean;
  bloqueado: boolean;
  motivoBloqueio: string | null;
}

export interface SaldoExtrasProps {
  cicloId: string;
  /** Valor controlado (ex.: vindo de Realtime). Se omitido, o componente busca via `GET /api/meu-saldo`. */
  saldo?: SaldoExtrasDados;
  /** Incrementar este valor força uma nova busca (usado por quem recebe eventos de Realtime sem já ter o payload pronto). */
  revalidarChave?: number;
}

export function SaldoExtras({ cicloId, saldo, revalidarChave }: SaldoExtrasProps): JSX.Element {
  const [interno, setInterno] = useState<SaldoExtrasDados | null>(saldo ?? null);
  const [carregando, setCarregando] = useState(saldo === undefined);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (saldo !== undefined) {
      setInterno(saldo);
      setCarregando(false);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    get<SaldoExtrasDados>(`/api/meu-saldo?cicloId=${encodeURIComponent(cicloId)}`).then((resultado) => {
      if (cancelado) return;
      if (resultado.ok) {
        setInterno(resultado.dados);
      } else {
        setErro(resultado.erro.mensagem);
      }
      setCarregando(false);
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revalidarChave é usado só para disparar refetch
  }, [cicloId, saldo, revalidarChave]);

  if (carregando && !interno) {
    return (
      <div role="status" aria-live="polite" className="rounded-lg border border-slate-200 p-4">
        Carregando saldo de extras…
      </div>
    );
  }

  if (erro) {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
        {erro}
      </div>
    );
  }

  if (!interno) {
    return (
      <div role="status" className="rounded-lg border border-slate-200 p-4 text-slate-600">
        Nenhum dado de saldo disponível.
      </div>
    );
  }

  const percentual = interno.limite > 0 ? Math.min(100, Math.round((interno.usadas / interno.limite) * 100)) : 0;
  const noLimite = interno.restantes <= 0 || interno.bloqueado;

  return (
    <div className="rounded-lg border border-slate-200 p-4" aria-live="polite">
      <div className="flex items-center justify-between text-sm font-medium text-slate-900">
        <span>Extras usadas</span>
        <span>
          {interno.usadas} / {interno.limite}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={interno.usadas}
        aria-valuemin={0}
        aria-valuemax={interno.limite}
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className={cn('h-full rounded-full transition-all', noLimite ? 'bg-red-600' : 'bg-emerald-600')}
          style={{ width: `${percentual}%` }}
        />
      </div>

      {noLimite ? (
        <p className="mt-2 text-sm text-red-800">
          {interno.motivoBloqueio ??
            `Você atingiu o limite de ${interno.limite} extra(s) neste ciclo. As ações de marcar novas extras estão desabilitadas por cota até o próximo ciclo.`}
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-600">{interno.restantes} extra(s) ainda disponíveis neste ciclo.</p>
      )}
    </div>
  );
}
