'use client';

/**
 * `/login/definir-pin` — primeiro acesso ou após reset (`API-AUTH-003`).
 *
 * PIN + confirmação; a validação de força (RN-30 — sequência, dígitos
 * repetidos, comuns) é **sempre** feita no servidor (FE-001.5) — este
 * formulário não replica a regra, só mostra `PIN_FRACO` quando a API
 * recusa.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { post } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { lerTokenParcial, limparTokenParcial, type TokenParcialGuardado } from '../_sessao-parcial';

interface RespostaDefinirPin {
  colaborador: { id: string; nome: string; matricula: string; rt: { codigo: string; nome: string } };
  expiraEm: string;
}

export default function DefinirPinPage(): JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<TokenParcialGuardado | null | undefined>(undefined);
  const [pin, setPin] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
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

    const resultado = await post<RespostaDefinirPin>('/api/auth/colaborador/definir-pin', {
      tokenParcial: token.tokenParcial,
      pin,
      confirmacao,
    });

    if (!resultado.ok) {
      setEnviando(false);
      if (resultado.erro.erro === 'TOKEN_INVALIDO') {
        limparTokenParcial();
        router.replace('/login');
        return;
      }
      if (resultado.erro.erro === 'PIN_JA_DEFINIDO') {
        router.replace('/login/pin');
        return;
      }
      // FE-001.3: PIN_FRACO, PIN_NAO_CONFERE, 422 de validação — texto da API.
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
        <h1 className="text-xl font-semibold text-slate-900">Defina seu PIN</h1>
        <p className="mt-1 text-sm text-slate-600">
          Primeiro acesso ou PIN reiniciado pelo administrador. Escolha um PIN de 4 a 6 dígitos.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-describedby={erro ? 'definir-pin-erro' : undefined}>
        <div className="space-y-1">
          <label htmlFor="pin" className="text-sm font-medium text-slate-800">
            Novo PIN
          </label>
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            minLength={4}
            maxLength={6}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="confirmacao" className="text-sm font-medium text-slate-800">
            Confirme o PIN
          </label>
          <input
            id="confirmacao"
            name="confirmacao"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            minLength={4}
            maxLength={6}
            required
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value.replace(/\D/g, ''))}
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          />
        </div>

        {erro ? (
          <p id="definir-pin-erro" role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          disabled={enviando || pin.length < 4 || confirmacao.length < 4}
          aria-busy={enviando}
        >
          {enviando ? 'Salvando…' : 'Definir PIN e entrar'}
        </Button>
      </form>
    </main>
  );
}
