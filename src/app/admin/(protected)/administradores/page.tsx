'use client';

/**
 * `/admin/administradores` — convidar e listar administradores. Fecha a
 * lacuna documentada em `/admin/configuracoes` (pedido do usuário).
 *
 * "Admin" aqui é qualquer conta do Supabase Auth deste projeto — não existe
 * papel/role separado (`src/server/auth/administradores.ts`). Convite manda
 * e-mail com link pra `/admin/definir-senha`; se o e-mail não chegar (dev
 * local, allowlist de redirect), o convidado pode usar `/admin/primeiro-acesso`
 * com a senha temporária, mesmo fallback que o admin inicial usa.
 */
import { useState } from 'react';
import { useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { post, type ErroApi } from '@/lib/api/client';

interface AdministradorListado {
  id: string;
  email: string | null;
  nome: string | null;
  criadoEm: string;
  ultimoLoginEm: string | null;
  mfaAtivo: boolean;
}

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdministradoresPage(): JSX.Element {
  const administradores = useRecursoApi<{ itens: AdministradorListado[] }>('/api/admin/administradores');

  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function convidar(): Promise<void> {
    setEnviando(true);
    setErro(null);
    setSucesso(null);

    const resultado = await post<{ administrador: { email: string | null } }>('/api/admin/administradores', {
      email: email.trim(),
      ...(nome.trim() ? { nome: nome.trim() } : {}),
    });

    setEnviando(false);

    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }

    setSucesso(`Convite enviado para ${resultado.dados.administrador.email}.`);
    setEmail('');
    setNome('');
    administradores.recarregar();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Administradores</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Convidar novo administrador</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            void convidar();
          }}
        >
          <label className="flex flex-col text-sm">
            E-mail
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-64 rounded border border-slate-300 p-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            Nome (opcional)
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-56 rounded border border-slate-300 p-2" />
          </label>
          <Button type="submit" disabled={enviando || !email.trim()} aria-busy={enviando}>
            {enviando ? 'Enviando…' : 'Enviar convite'}
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          O convite chega por e-mail com um link para definir a senha e cadastrar o autenticador (MFA). Se o e-mail não
          chegar (ex.: ambiente de teste), o convidado pode entrar por <code>/admin/primeiro-acesso</code> com a senha
          temporária recebida.
        </p>
        {erro ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erro.mensagem}
          </p>
        ) : null}
        {sucesso ? (
          <p role="status" className="mt-2 text-sm text-emerald-700">
            {sucesso}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Administradores atuais</h2>
        {administradores.carregando ? (
          <EstadoCarregando />
        ) : administradores.erro ? (
          <EstadoErro mensagem={administradores.erro} />
        ) : !administradores.dados || administradores.dados.itens.length === 0 ? (
          <EstadoVazio texto="Nenhum administrador encontrado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="p-2">Nome</th>
                  <th className="p-2">E-mail</th>
                  <th className="p-2">Convidado em</th>
                  <th className="p-2">Último acesso</th>
                  <th className="p-2">MFA</th>
                </tr>
              </thead>
              <tbody>
                {administradores.dados.itens.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="p-2 font-medium text-slate-900">{a.nome ?? '—'}</td>
                    <td className="p-2">{a.email ?? '—'}</td>
                    <td className="p-2">{formatarData(a.criadoEm)}</td>
                    <td className="p-2">{formatarData(a.ultimoLoginEm)}</td>
                    <td className="p-2">
                      {a.mfaAtivo ? <Badge variant="default">Ativo</Badge> : <Badge variant="secondary">Pendente</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
