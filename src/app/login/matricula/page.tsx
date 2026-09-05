'use client';

/**
 * `/login/matricula` — etapa 1 (`API-AUTH-001`): matrícula.
 *
 * Primeiro acesso (ou PIN esquecido) — login normal do dia a dia é
 * `/login` (matrícula+PIN, `_conflitos.md` item 33). Não cria sessão —
 * devolve `tokenParcial` (uso único, 3 min) que habilita a etapa do PIN.
 * Guardado em `sessionStorage` só até o fim do fluxo: não é PIN (FE-001.8
 * proíbe isso), é um token de curta duração cujo próprio propósito é ser
 * efêmero, e `sessionStorage` (por aba, some ao fechar) é o lugar certo para
 * atravessar a troca de página sem voltar ao servidor.
 *
 * Rota renomeada de `/login/cpf` para `/login/matricula` — migração de
 * CPF+PIN para matrícula+PIN: o campo de CPF foi removido do sistema
 * (colaborador não guarda mais CPF nenhum), então esta etapa passou a
 * identificar o colaborador só pela matrícula.
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { post } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { CHAVE_TOKEN_PARCIAL } from '../_sessao-parcial';

interface RespostaLogin {
  tokenParcial: string;
  precisaDefinirPin: boolean;
  expiraEm: string;
}

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const [matricula, setMatricula] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function onSubmit(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    const resultado = await post<RespostaLogin>('/api/auth/colaborador/login', {
      matricula: matricula.trim(),
    });

    if (!resultado.ok) {
      // FE-001.3: mensagem vem sempre da API, nunca inventada aqui —
      // cobre CREDENCIAIS_INVALIDAS, CONTA_BLOQUEADA, COLABORADOR_INATIVO,
      // MUITAS_TENTATIVAS.
      setEnviando(false);
      setErro(resultado.erro.mensagem);
      return;
    }

    sessionStorage.setItem(
      CHAVE_TOKEN_PARCIAL,
      JSON.stringify({ tokenParcial: resultado.dados.tokenParcial, expiraEm: resultado.dados.expiraEm }),
    );

    // `enviando` fica `true` até a navegação (nunca volta pro estado ocioso
    // no sucesso) — mesmo achado de `_conflitos.md` que motivou o mesmo ajuste
    // em `/login`, `/login/pin` e `/login/definir-pin`.
    if (resultado.dados.precisaDefinirPin) {
      router.push('/login/definir-pin');
    } else {
      router.push('/login/pin');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Primeiro acesso</h1>
        <p className="mt-1 text-sm text-slate-600">Entre com sua matrícula para definir ou recuperar seu PIN.</p>
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

        {erro ? (
          <p id="login-erro" role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Entrando…' : 'Continuar'}
        </Button>
        <a href="/login" className="block text-center text-sm text-slate-600 underline">
          Já tenho PIN — entrar com matrícula e PIN
        </a>
      </form>
    </main>
  );
}
