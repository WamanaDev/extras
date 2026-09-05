'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { post, type ErroApi } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { obterSupabaseBrowser } from '@/lib/supabase/browser-client';

/**
 * `/admin/login` — FE-001, API-AUTH-006.
 *
 * Duas etapas: (1) e-mail + senha via `POST /api/auth/admin/login`; (2) se a
 * resposta trouxer `{ precisaMfa: true }`, um segundo passo pede o código do
 * autenticador. A verificação do código roda no SDK do Supabase no
 * navegador (`obterSupabaseBrowser`) — a rota de login não expõe um passo de
 * "verificar código" (ver doc-comment de `src/server/auth/admin-login.ts`:
 * "fora do escopo desta rota"). Como a resposta do servidor
 * (`RespostaAdminLoginMfa`) não inclui o `factorId` (só `desafioId`), listar
 * os fatores e desafiar de novo pelo próprio SDK do navegador
 * (`mfa.challengeAndVerify`) evita depender de um campo que a API não
 * expõe — gap registrado em `_conflitos.md`.
 *
 * FE-001.8: senha e código MFA nunca tocam localStorage/sessionStorage/URL —
 * só corpo de requisição, em memória de componente.
 */
type Etapa = 'CREDENCIAIS' | 'MFA';

interface RespostaLoginMfa {
  precisaMfa: true;
  desafioId: string;
}

interface RespostaLoginSucesso {
  admin: { id: string; email: string; nome: string | null };
}

type RespostaLogin = RespostaLoginMfa | RespostaLoginSucesso;

export default function AdminLoginPage(): JSX.Element {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>('CREDENCIAIS');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApi | string | null>(null);

  async function entrarComSenha(): Promise<void> {
    setEnviando(true);
    setErro(null);
    const resultado = await post<RespostaLogin>('/api/auth/admin/login', { email, senha });
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    if ('precisaMfa' in resultado.dados) {
      setEtapa('MFA');
      return;
    }
    router.push('/admin');
    router.refresh();
  }

  async function verificarMfa(): Promise<void> {
    setEnviando(true);
    setErro(null);
    try {
      const supabase = obterSupabaseBrowser();
      const { data: fatores, error: erroFatores } = await supabase.auth.mfa.listFactors();
      const fator = fatores?.all.find((f: { status: string; id: string }) => f.status === 'verified');
      if (erroFatores || !fator) {
        setErro('Não foi possível localizar seu fator de autenticação. Tente entrar novamente.');
        setEnviando(false);
        return;
      }
      const { error: erroVerificacao } = await supabase.auth.mfa.challengeAndVerify({
        factorId: fator.id,
        code: codigo.trim(),
      });
      if (erroVerificacao) {
        setErro('Código inválido ou expirado. Tente novamente.');
        setEnviando(false);
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch {
      setErro('Falha ao verificar o código. Tente novamente.');
      setEnviando(false);
    }
  }

  const mensagemErro = typeof erro === 'string' ? erro : erro?.mensagem;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Acesso administrativo</h1>

      {etapa === 'CREDENCIAIS' ? (
        <form
          className="space-y-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            void entrarComSenha();
          }}
        >
          <label className="flex flex-col text-sm">
            E-mail
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              className="mt-1 rounded border border-slate-300 p-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            Senha
            <input
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              className="mt-1 rounded border border-slate-300 p-2"
            />
          </label>

          {mensagemErro ? (
            <p role="alert" className="text-sm text-red-800">
              {mensagemErro}
            </p>
          ) : null}

          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? 'Entrando…' : 'Entrar'}
          </Button>
          <a href="/admin/recuperar-senha" className="block text-center text-sm text-slate-600 underline">
            Esqueci minha senha
          </a>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            void verificarMfa();
          }}
        >
          <p className="text-sm text-slate-600">Digite o código do seu autenticador (MFA).</p>
          <label className="flex flex-col text-sm">
            Código
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={codigo}
              onChange={(evento) => setCodigo(evento.target.value)}
              className="mt-1 rounded border border-slate-300 p-2 tracking-widest"
            />
          </label>

          {mensagemErro ? (
            <p role="alert" className="text-sm text-red-800">
              {mensagemErro}
            </p>
          ) : null}

          <Button type="submit" disabled={enviando || codigo.trim() === ''} className="w-full">
            {enviando ? 'Verificando…' : 'Verificar'}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setEtapa('CREDENCIAIS')} disabled={enviando}>
            Voltar
          </Button>
        </form>
      )}
    </main>
  );
}
