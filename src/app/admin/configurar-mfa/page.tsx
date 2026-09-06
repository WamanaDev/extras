'use client';

/**
 * `/admin/configurar-mfa` — cadastro do fator MFA (TOTP), obrigatório antes de
 * `API-AUTH-006` aceitar login (`stack.md`, "Auth admin: Supabase Auth + MFA";
 * `API-AUTH-006`, teste #2: "Sem MFA cadastrado → MFA_OBRIGATORIO"). Mesmo gap
 * de `_conflitos.md` que `/admin/definir-senha`: nenhuma spec de `06-frontend/`
 * descreve esta tela — sem ela, o admin do seed nunca teria como cadastrar o
 * fator que a própria API exige.
 *
 * Passo seguinte de `/admin/definir-senha` — assume que a sessão do Supabase já
 * existe (criada pelo link de convite/senha) no momento em que esta página
 * carrega.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/Logo';
import { obterSupabaseBrowser } from '@/lib/supabase/browser-client';

type Estado = 'CARREGANDO' | 'JA_TEM_FATOR' | 'AGUARDANDO_CODIGO' | 'VERIFICANDO' | 'ERRO';

export default function ConfigurarMfaPage(): JSX.Element {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>('CARREGANDO');
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [segredo, setSegredo] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  // Mesmo motivo de `/admin/definir-senha`: StrictMode roda efeitos 2x em
  // dev, e chamar `enroll` duas vezes cria dois fatores em corrida.
  const jaProcessou = useRef(false);

  useEffect(() => {
    if (jaProcessou.current) return;
    jaProcessou.current = true;
    const supabase = obterSupabaseBrowser();
    (async () => {
      const { data: fatores } = await supabase.auth.mfa.listFactors();
      const jaVerificado = fatores?.all.some((f: { status: string }) => f.status === 'verified');
      if (jaVerificado) {
        setEstado('JA_TEM_FATOR');
        return;
      }

      // Sobra de uma tentativa anterior que não chegou a verificar (ex.: o
      // `useEffect` roda 2x em StrictMode/dev, ou o usuário recarregou no
      // meio do fluxo). Supabase rejeita um novo `enroll` com o mesmo nome
      // amigável (vazio, no nosso caso) enquanto o fator antigo existir —
      // "A factor with the friendly name ... already exists" (422). Limpa
      // antes de tentar de novo; um fator não verificado nunca protegeu login
      // nenhum, então removê-lo é seguro.
      const pendentes = fatores?.all.filter((f: { status: string }) => f.status !== 'verified') ?? [];
      for (const pendente of pendentes) {
        await supabase.auth.mfa.unenroll({ factorId: (pendente as { id: string }).id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error || !data) {
        // eslint-disable-next-line no-console
        console.error('mfa.enroll falhou:', error);
        setErro(`Não foi possível iniciar o cadastro de MFA: ${error?.message ?? 'erro desconhecido'} (veja o console para detalhes).`);
        setEstado('ERRO');
        return;
      }
      setFactorId(data.id);
      setQrCodeSvg(data.totp.qr_code);
      setSegredo(data.totp.secret);
      setEstado('AGUARDANDO_CODIGO');
    })();
  }, []);

  async function confirmar(): Promise<void> {
    if (!factorId) return;
    setErro(null);
    setEstado('VERIFICANDO');
    const supabase = obterSupabaseBrowser();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo.trim() });
    if (error) {
      setErro('Código inválido ou expirado. Confira o horário do dispositivo e tente de novo.');
      setEstado('AGUARDANDO_CODIGO');
      return;
    }
    router.push('/admin');
    router.refresh();
  }

  if (estado === 'CARREGANDO') {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
        <p className="text-sm text-slate-600">Carregando…</p>
      </main>
    );
  }

  if (estado === 'JA_TEM_FATOR') {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
        <Logo size={40} className="mb-4" />
        <h1 className="mb-2 text-xl font-semibold text-slate-900">MFA já configurado</h1>
        <p className="mb-4 text-sm text-slate-600">Sua conta já tem um autenticador cadastrado.</p>
        <Button className="w-full" onClick={() => router.push('/admin/login')}>
          Ir para o login
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <Logo size={40} className="mb-4" />
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Configure seu autenticador</h1>
      <p className="mb-4 text-sm text-slate-600">
        Escaneie o QR code com um app autenticador (Google Authenticator, Authy, 1Password, etc).
      </p>

      {qrCodeSvg ? (
        <div
          className="mx-auto mb-4 h-48 w-48"
          // eslint-disable-next-line react/no-danger -- SVG vem direto do Supabase Auth (mfa.enroll), não de entrada do usuário.
          dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
        />
      ) : null}

      {segredo ? (
        <p className="mb-4 break-all text-center text-xs text-slate-500">
          Não consegue escanear? Digite manualmente: <code className="font-mono">{segredo}</code>
        </p>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          void confirmar();
        }}
      >
        <label className="flex flex-col text-sm">
          Código do autenticador
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

        {erro ? (
          <p role="alert" className="text-sm text-red-800">
            {erro}
          </p>
        ) : null}

        <Button type="submit" disabled={estado === 'VERIFICANDO' || codigo.trim() === ''} className="w-full">
          {estado === 'VERIFICANDO' ? 'Confirmando…' : 'Confirmar e entrar'}
        </Button>
      </form>
    </main>
  );
}
