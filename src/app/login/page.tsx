'use client';

/**
 * `/login` — login rápido do dia a dia: matrícula + PIN, direto.
 *
 * `POST /api/auth/colaborador/login-rapido` — endpoint adicional (não é
 * `API-AUTH-001`/`002`, ambas ainda intactas em `/login/matricula`). Decisão
 * do usuário, aprovada em conversa: depois do primeiro acesso (PIN
 * definido), login normal não pede mais CPF (campo removido do sistema). Ver
 * `src/server/auth/login-rapido.ts` e `_conflitos.md`, item 33.
 *
 * FE-001.8: PIN nunca toca localStorage/sessionStorage/URL — só corpo da
 * requisição, em memória do componente.
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { post } from '@/lib/api/client';
import { Button } from '@/components/ui/button';

interface RespostaLoginRapido {
  colaborador: { id: string; nome: string; matricula: string; rt: { codigo: string; nome: string } };
  expiraEm: string;
}

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const [matricula, setMatricula] = useState('');
  const [pin, setPin] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function onSubmit(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    const resultado = await post<RespostaLoginRapido>('/api/auth/colaborador/login-rapido', {
      matricula: matricula.trim(),
      pin,
    });

    if (!resultado.ok) {
      // FE-001.3: mensagem vem sempre da API — cobre CREDENCIAIS_INVALIDAS,
      // CONTA_BLOQUEADA, COLABORADOR_INATIVO, MUITAS_TENTATIVAS.
      setEnviando(false);
      setErro(resultado.erro.mensagem);
      return;
    }

    // `enviando` fica `true` até a navegação — nunca volta pro estado ocioso
    // no sucesso. `/painel` ainda tem que buscar sessão + ciclo + saldo +
    // escala (vários round-trips reais); sem isso, o botão volta ao normal e
    // a tela fica parada por um instante, dando a impressão de que a
    // solicitação falhou (achado em uso real, ver `_conflitos.md`).
    router.push('/painel');
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Escala 12x36</h1>
        <p className="mt-1 text-sm text-slate-600">Entre com sua matrícula e PIN.</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-describedby={erro ? 'login-erro' : undefined}>
        <div className="space-y-1">
          <label htmlFor="matricula" className="text-sm font-medium text-slate-800">
            Matrícula
          </label>
          <input
            id="matricula"
            name="matricula"
            type="text"
            autoComplete="username"
            required
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          />
        </div>

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
          <p id="login-erro" role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={enviando || pin.length < 4} aria-busy={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Button>

        <a href="/login/matricula" className="block text-center text-sm text-slate-600 underline">
          Primeiro acesso ou esqueci o PIN
        </a>
      </form>
    </main>
  );
}
