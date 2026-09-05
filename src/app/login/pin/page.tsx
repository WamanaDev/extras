'use client';

/**
 * `/login/pin` — etapa 2 (`API-AUTH-002`): PIN, cria a sessão.
 *
 * Exige o `tokenParcial` da etapa 1 em `sessionStorage` — sem ele, não há
 * como chegar aqui por um fluxo válido; redireciona de volta para `/login`
 * em vez de mostrar um formulário que só pode falhar (nunca tela branca,
 * FE-001.2, e nunca um erro incompreensível por token ausente).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { post } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { lerTokenParcial, limparTokenParcial, type TokenParcialGuardado } from '../_sessao-parcial';

interface RespostaPin {
  colaborador: { id: string; nome: string; matricula: string; rt: { codigo: string; nome: string } };
  expiraEm: string;
}

export default function LoginPinPage(): JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<TokenParcialGuardado | null | undefined>(undefined);
  const [pin, setPin] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const guardado = lerTokenParcial();
    setToken(guardado);
    if (!guardado) {
      router.replace('/login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!token) return;
    setErro(null);
    setEnviando(true);

    const resultado = await post<RespostaPin>('/api/auth/colaborador/pin', {
      tokenParcial: token.tokenParcial,
      pin,
    });

    if (!resultado.ok) {
      setEnviando(false);
      if (resultado.erro.erro === 'TOKEN_INVALIDO') {
        limparTokenParcial();
        router.replace('/login');
        return;
      }
      if (resultado.erro.erro === 'PIN_NAO_DEFINIDO') {
        router.replace('/login/definir-pin');
        return;
      }
      // FE-001.3: CREDENCIAIS_INVALIDAS, CONTA_BLOQUEADA, MUITAS_TENTATIVAS — texto da API.
      setErro(resultado.erro.mensagem);
      return;
    }

    // `enviando` fica `true` até a navegação — nunca volta pro estado ocioso
    // no sucesso, senão o botão volta ao normal e a tela fica parada por um
    // instante enquanto `/painel` busca sessão+ciclo+saldo+escala, dando a
    // impressão de que a solicitação falhou (achado em uso real).
    limparTokenParcial();
    router.push('/painel');
  }

  if (token === undefined) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm items-center justify-center px-4">
        <p role="status" aria-live="polite" className="text-sm text-slate-600">
          Carregando…
        </p>
      </main>
    );
  }

  if (!token) {
    // Redirecionando (efeito acima) — não renderiza formulário inútil.
    return (
      <main className="mx-auto flex min-h-screen max-w-sm items-center justify-center px-4">
        <p role="status" className="text-sm text-slate-600">
          Redirecionando para o login…
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Digite seu PIN</h1>
        <p className="mt-1 text-sm text-slate-600">O PIN de 4 a 6 dígitos que você definiu.</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-describedby={erro ? 'pin-erro' : undefined}>
        <div className="space-y-1">
          <label htmlFor="pin" className="text-sm font-medium text-slate-800">
            PIN
          </label>
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            minLength={4}
            maxLength={6}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          />
        </div>

        {erro ? (
          <p id="pin-erro" role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={enviando || pin.length < 4} aria-busy={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </main>
  );
}
