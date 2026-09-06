'use client';

/**
 * `/admin/recuperar-senha` — "esqueci minha senha" para admin. Mesma família
 * de gap de `_conflitos.md` item 27 (nenhuma spec de `06-frontend/` cobre
 * recuperação de senha do admin, só o login em si — `API-AUTH-006`).
 *
 * `resetPasswordForEmail` manda um link de recuperação (janela mais longa que
 * o magic link de convite, mas ainda de uso único) que redireciona pra
 * `/admin/definir-senha` — a mesma tela usada no primeiro acesso, porque o
 * requisito ali (sessão Supabase ativa + formulário de nova senha) é
 * idêntico ao de recuperação; não duplica UI.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/Logo';
import { obterSupabaseBrowser } from '@/lib/supabase/browser-client';

export default function RecuperarSenhaPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(): Promise<void> {
    setErro(null);
    setEnviando(true);
    const supabase = obterSupabaseBrowser();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/definir-senha`,
    });
    setEnviando(false);
    // Nunca revela se o e-mail existe ou não (mesma regra de "recurso de
    // terceiro" de `contrato-comum.md`) — sempre mostra a mesma confirmação,
    // erro real só por falha de rede/serviço.
    if (error && error.status && error.status >= 500) {
      setErro('Não foi possível enviar o e-mail agora. Tente novamente em instantes.');
      return;
    }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
        <Logo size={40} className="mb-4" />
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Verifique seu e-mail</h1>
        <p className="text-sm text-slate-600">
          Se <strong>{email}</strong> tiver uma conta de administrador, enviamos um link para redefinir a senha. O
          link é de uso único e expira em algumas horas.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <Logo size={40} className="mb-4" />
      <h1 className="mb-2 text-xl font-semibold text-slate-900">Recuperar senha</h1>
      <p className="mb-6 text-sm text-slate-600">Informe seu e-mail de administrador para receber um link de redefinição.</p>
      <form
        className="space-y-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          void enviar();
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

        {erro ? (
          <p role="alert" className="text-sm text-red-800">
            {erro}
          </p>
        ) : null}

        <Button type="submit" disabled={enviando} className="w-full">
          {enviando ? 'Enviando…' : 'Enviar link de recuperação'}
        </Button>
      </form>
    </main>
  );
}
