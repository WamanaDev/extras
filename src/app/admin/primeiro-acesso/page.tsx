'use client';

/**
 * `/admin/primeiro-acesso` — bootstrap alternativo ao link de convite por
 * e-mail (`/admin/definir-senha`), quando o link não é viável (allowlist de
 * redirect do projeto Supabase não inclui `http://localhost:3000/...` em
 * dev, ou o e-mail nunca chega). Mesmo gap de `_conflitos.md` item 27.
 *
 * Login por senha direto no SDK do navegador (`signInWithPassword`), sem
 * passar por `POST /api/auth/admin/login` — aquela rota exige MFA já
 * cadastrado (`API-AUTH-006`, teste #2), o que é impossível na primeira vez.
 * Aqui a sessão fica em AAL1 (senha, sem MFA), suficiente para
 * `auth.updateUser`/`auth.mfa.enroll` nas duas telas seguintes. Depois de
 * cadastrar o MFA, todo login subsequente deve usar `/admin/login` (fluxo
 * completo com AAL2), nunca mais esta página.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/Logo';
import { obterSupabaseBrowser } from '@/lib/supabase/browser-client';

export default function PrimeiroAcessoPage(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(): Promise<void> {
    setErro(null);
    setEnviando(true);
    const supabase = obterSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setEnviando(false);
    if (error) {
      setErro('E-mail ou senha temporária inválidos.');
      return;
    }
    router.push('/admin/definir-senha');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <Logo size={40} className="mb-4" />
      <h1 className="mb-2 text-xl font-semibold text-slate-900">Primeiro acesso</h1>
      <p className="mb-6 text-sm text-slate-600">
        Entre com o e-mail e a senha temporária que você recebeu para definir sua senha definitiva e cadastrar o
        autenticador (MFA).
      </p>
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
          Senha temporária
          <input
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            className="mt-1 rounded border border-slate-300 p-2"
          />
        </label>

        {erro ? (
          <p role="alert" className="text-sm text-red-800">
            {erro}
          </p>
        ) : null}

        <Button type="submit" disabled={enviando} className="w-full">
          {enviando ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </main>
  );
}
