'use client';

import { useState } from 'react';
import { post, type ErroApi } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/Logo';
import { VerificacaoWhatsapp } from '@/components/admin/VerificacaoWhatsapp';

/**
 * `/admin/login` — FE-001, API-AUTH-006.
 *
 * Duas etapas: (1) e-mail + senha via `POST /api/auth/admin/login`, que já
 * manda o código pro WhatsApp do admin; (2) o código de 6 dígitos
 * (`<VerificacaoWhatsapp />` → `POST /api/auth/admin/codigo/verificar`).
 * Segundo fator por WhatsApp em vez de app autenticador — pedido do
 * usuário, ver `src/server/auth/segundo-fator.ts`.
 *
 * FE-001.8: senha e código nunca tocam localStorage/sessionStorage/URL —
 * só corpo de requisição, em memória de componente.
 */
type Etapa = 'CREDENCIAIS' | 'CODIGO';

interface RespostaLogin {
  precisaCodigo: true;
  destino: string;
}

export default function AdminLoginPage(): JSX.Element {
  const [etapa, setEtapa] = useState<Etapa>('CREDENCIAIS');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [destino, setDestino] = useState<string | null>(null);
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
    setDestino(resultado.dados.destino);
    setEtapa('CODIGO');
  }

  const mensagemErro = typeof erro === 'string' ? erro : erro?.mensagem;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <Logo size={40} className="mb-4" />
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
        <VerificacaoWhatsapp destino={destino} onVoltar={() => setEtapa('CREDENCIAIS')} />
      )}

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
