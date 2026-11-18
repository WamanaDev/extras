'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { post, type ErroApi } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/Logo';

/**
 * `/admin/login` — FE-001, API-AUTH-006.
 *
 * Etapa única: e-mail + senha via `POST /api/auth/admin/login`; com sucesso,
 * vai para `/admin`. Ver `_conflitos.md` sobre o nível de
 * proteção do login de admin.
 *
 * FE-001.8: a senha nunca toca localStorage/sessionStorage/URL — só corpo de
 * requisição, em memória de componente.
 */
interface RespostaLogin {
  admin: { id: string; email: string; nome: string | null };
}

export default function AdminLoginPage(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApi | string | null>(null);

  async function entrar(): Promise<void> {
    setEnviando(true);
    setErro(null);
    const resultado = await post<RespostaLogin>('/api/auth/admin/login', { email, senha });
    if (!resultado.ok) {
      setEnviando(false);
      setErro(resultado.erro);
      return;
    }
    router.push('/admin');
    router.refresh();
  }

  const mensagemErro = typeof erro === 'string' ? erro : erro?.mensagem;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <Logo size={40} className="mb-4" />
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Acesso administrativo</h1>

      <form
          className="space-y-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            void entrar();
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

      <p className="mt-6 text-center text-xs text-slate-400">
        <a href="/privacidade" className="underline hover:text-slate-600">
          Privacidade
        </a>{' '}
        ·{' '}
        <a href="/termos" className="underline hover:text-slate-600">
          Termos de uso
        </a>
      </p>
    </main>
  );
}
