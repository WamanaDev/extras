'use client';

/**
 * Etapa 2 do login de admin: código de 6 dígitos recebido no WhatsApp
 * (`src/server/auth/segundo-fator.ts`). Usado por `/admin/login` (logo após
 * a senha) e por `/admin/verificar` (sessão de senha já aberta — convite
 * recém-aceito ou `admin_2fa` expirado).
 *
 * FE-001.8: o código nunca toca localStorage/sessionStorage/URL.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { post } from '@/lib/api/client';
import { Button } from '@/components/ui/button';

interface Props {
  destino: string | null;
  onVoltar?: () => void;
}

export function VerificacaoWhatsapp({ destino: destinoInicial, onVoltar }: Props): JSX.Element {
  const router = useRouter();
  const [destino, setDestino] = useState(destinoInicial);
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function verificar(): Promise<void> {
    setEnviando(true);
    setErro(null);
    setAviso(null);
    const resultado = await post<{ admin: unknown }>('/api/auth/admin/codigo/verificar', { codigo: codigo.replace(/\D/g, '') });
    if (!resultado.ok) {
      setErro(resultado.erro.mensagem);
      if (resultado.erro.erro === 'CODIGO_EXPIRADO') setCodigo('');
      setEnviando(false);
      return;
    }
    router.push('/admin');
    router.refresh();
  }

  async function reenviar(): Promise<void> {
    setReenviando(true);
    setErro(null);
    setAviso(null);
    const resultado = await post<{ destino?: string; jaVerificado?: boolean }>('/api/auth/admin/codigo/enviar');
    setReenviando(false);
    if (!resultado.ok) {
      setErro(resultado.erro.mensagem);
      return;
    }
    if (resultado.dados.jaVerificado) {
      router.push('/admin');
      router.refresh();
      return;
    }
    if (resultado.dados.destino) setDestino(resultado.dados.destino);
    setCodigo('');
    setAviso('Enviamos um novo código.');
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        void verificar();
      }}
    >
      <p className="text-sm text-slate-600">
        Enviamos um código de 6 dígitos para o seu WhatsApp{destino ? ` terminado em ${destino.replace(/\D/g, '')}` : ''}.
      </p>
      <label className="flex flex-col text-sm">
        Código
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
          autoFocus
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value)}
          className="mt-1 rounded border border-slate-300 p-2 tracking-widest"
        />
      </label>

      {erro ? (
        <p role="alert" className="text-sm text-red-800">
          {erro}
        </p>
      ) : null}
      {aviso ? (
        <p role="status" className="text-sm text-emerald-700">
          {aviso}
        </p>
      ) : null}

      <Button type="submit" disabled={enviando || codigo.replace(/\D/g, '').length !== 6} className="w-full">
        {enviando ? 'Verificando…' : 'Entrar'}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={() => void reenviar()} disabled={enviando || reenviando}>
        {reenviando ? 'Reenviando…' : 'Reenviar código'}
      </Button>
      {onVoltar ? (
        <Button type="button" variant="ghost" className="w-full" onClick={onVoltar} disabled={enviando}>
          Voltar
        </Button>
      ) : null}
    </form>
  );
}
