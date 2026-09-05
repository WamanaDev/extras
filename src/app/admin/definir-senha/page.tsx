'use client';

/**
 * `/admin/definir-senha` — aceitação do convite inicial do admin (`prisma/seed.ts`,
 * `seedAdminInicial`) e troca de senha manual depois.
 *
 * NÃO é entregável de nenhuma spec de `04-api/`/`06-frontend/` — gap real entre
 * `03-banco/migrations.md` ("Seed" cria o admin via `inviteUserByEmail`, convite
 * expira) e `API-AUTH-006`/`paginas.md` (assumem que o admin já tem senha+MFA
 * configurados, nunca descrevem como o primeiro admin chega lá). Sem esta
 * página, o convite do seed é inútil — o link do Supabase estabelece uma
 * sessão mas não existe onde defini senha. Ver `_conflitos.md`.
 *
 * `createBrowserClient` (`@supabase/ssr`) usa `flowType: 'pkce'` por padrão,
 * que só detecta sessão automaticamente a partir de `?code=` na URL — o
 * redirect do link de convite/recuperação do Supabase (`/auth/v1/verify`)
 * sempre entrega os tokens no formato implícito, `#access_token=...
 * &refresh_token=...`, independente do flow configurado no client. Sem essa
 * diferença resolvida manualmente, `getSession()` nunca encontra nada e a
 * página mostra "link inválido" mesmo com um token válido na URL. Por isso
 * este componente lê o hash na mão e chama `setSession` explicitamente antes
 * de tentar `getSession()`.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { obterSupabaseBrowser } from '@/lib/supabase/browser-client';

type Estado = 'VERIFICANDO' | 'PRONTO' | 'LINK_INVALIDO' | 'SALVANDO' | 'SALVO';

export default function DefinirSenhaPage(): JSX.Element {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>('VERIFICANDO');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [motivoLinkInvalido, setMotivoLinkInvalido] = useState<string | null>(null);
  // React 18 StrictMode roda efeitos 2x em dev — processar o mesmo par
  // access_token/refresh_token duas vezes aciona a rotação de refresh token
  // do GoTrue (a 2ª chamada de `setSession` invalida o token que a 1ª acabou
  // de estabelecer), deixando a sessão em estado inválido logo depois de
  // "PRONTO" (só aparece no próximo request, ex.: 401 ao salvar a senha).
  const jaProcessou = useRef(false);

  useEffect(() => {
    if (jaProcessou.current) return;
    jaProcessou.current = true;
    const supabase = obterSupabaseBrowser();
    (async () => {
      // `#access_token=...&refresh_token=...` — formato implícito que o
      // `/auth/v1/verify` do Supabase sempre usa nesse redirect, ver
      // docstring do arquivo. Em vez de sucesso, o Supabase às vezes redireciona
      // com `#error=...&error_code=...&error_description=...` direto (link já
      // usado/expirado antes mesmo de gerar token) — captura isso primeiro.
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const erroCodigo = hash.get('error_code');
      const erroDescricao = hash.get('error_description');
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');

      if (erroCodigo) {
        // eslint-disable-next-line no-console
        console.error('Erro no redirect do Supabase:', erroCodigo, erroDescricao);
        setMotivoLinkInvalido(`${erroCodigo}: ${erroDescricao ?? ''}`);
        setEstado('LINK_INVALIDO');
        return;
      }

      if (accessToken && refreshToken) {
        const { error: erroSessao } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        // Limpa o hash da URL (tokens não devem ficar visíveis/persistir no histórico — FE-001.8).
        window.history.replaceState(null, '', window.location.pathname);
        if (erroSessao) {
          // eslint-disable-next-line no-console
          console.error('setSession falhou:', erroSessao);
          setMotivoLinkInvalido(erroSessao.message);
          setEstado('LINK_INVALIDO');
          return;
        }
        setEstado('PRONTO');
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        // eslint-disable-next-line no-console
        console.error('getSession sem sessão:', error);
        setMotivoLinkInvalido(error?.message ?? 'nenhum token encontrado na URL nem sessão ativa');
        setEstado('LINK_INVALIDO');
        return;
      }
      setEstado('PRONTO');
    })();
  }, []);

  async function salvar(): Promise<void> {
    setErro(null);
    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (senha !== confirmacao) {
      setErro('As senhas não conferem.');
      return;
    }
    setEstado('SALVANDO');
    const supabase = obterSupabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setErro('Não foi possível salvar a senha. Tente pedir um novo link de convite.');
      setEstado('PRONTO');
      return;
    }
    setEstado('SALVO');
    router.push('/admin/configurar-mfa');
  }

  if (estado === 'VERIFICANDO') {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
        <p className="text-sm text-slate-600">Verificando link…</p>
      </main>
    );
  }

  if (estado === 'LINK_INVALIDO') {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Link inválido ou expirado</h1>
        <p className="text-sm text-slate-600">
          O link de convite expirou ou já foi usado. Peça a outro administrador (ou rode novamente o bootstrap) para
          gerar um novo convite.
        </p>
        {motivoLinkInvalido ? <p className="mt-2 text-xs text-slate-400">Detalhe técnico: {motivoLinkInvalido}</p> : null}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Defina sua senha</h1>
      <form
        className="space-y-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          void salvar();
        }}
      >
        <label className="flex flex-col text-sm">
          Nova senha
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            className="mt-1 rounded border border-slate-300 p-2"
          />
        </label>
        <label className="flex flex-col text-sm">
          Confirme a senha
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmacao}
            onChange={(evento) => setConfirmacao(evento.target.value)}
            className="mt-1 rounded border border-slate-300 p-2"
          />
        </label>

        {erro ? (
          <p role="alert" className="text-sm text-red-800">
            {erro}
          </p>
        ) : null}

        <Button type="submit" disabled={estado === 'SALVANDO'} className="w-full">
          {estado === 'SALVANDO' ? 'Salvando…' : 'Salvar e continuar'}
        </Button>
      </form>
    </main>
  );
}
