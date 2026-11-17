'use client';

/**
 * `/admin/administradores` — convidar, listar e revogar administradores.
 * Fecha a lacuna documentada em `/admin/configuracoes` (pedido do usuário).
 *
 * "Admin" aqui é qualquer conta do Supabase Auth deste projeto — não existe
 * papel/role separado (`src/server/auth/administradores.ts`). Convite manda
 * e-mail com link pra `/admin/definir-senha`; se o e-mail não chegar (dev
 * local, allowlist de redirect), o convidado pode usar `/admin/primeiro-acesso`
 * com a senha temporária, mesmo fallback que o admin inicial usa.
 *
 * Revogar (pedido do usuário) é a mesma ação pra conta já ativa ou convite
 * ainda não aceito (`pendente`) — o Supabase não distingue as duas coisas,
 * ver docstring de `revogarAdministrador`. Nunca mostra o botão na própria
 * linha (busca a própria identidade via `GET /api/auth/me`) — a API também
 * recusa (`NAO_PODE_REVOGAR_A_SI_MESMO`), isso aqui só evita a tentativa.
 *
 * WhatsApp (pedido do usuário): o segundo fator de login é um código pelo
 * WhatsApp (`src/server/auth/segundo-fator.ts`). O número é obrigatório no
 * convite e só é cadastrado/trocado aqui, por um admin já logado — nunca
 * pelo próprio convidado.
 */
import { useState } from 'react';
import { useRecursoApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { ConfirmacaoImpacto } from '@/components/comum/ConfirmacaoImpacto';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { post, patch, del, type ErroApi } from '@/lib/api/client';

interface AdministradorListado {
  id: string;
  email: string | null;
  nome: string | null;
  criadoEm: string;
  ultimoLoginEm: string | null;
  whatsapp: string | null;
  pendente: boolean;
}

interface RespostaMe {
  tipo: 'ADMIN' | 'COLABORADOR';
  admin?: { id: string };
}

/** `5511987654321` → `+55 (11) 98765-4321`; outros formatos ficam como vieram. */
function formatarWhatsapp(numero: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(numero);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${numero}`;
}

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdministradoresPage(): JSX.Element {
  const administradores = useRecursoApi<{ itens: AdministradorListado[] }>('/api/admin/administradores');
  const me = useRecursoApi<RespostaMe>('/api/auth/me');
  const meuId = me.dados?.admin?.id;

  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [paraRevogar, setParaRevogar] = useState<AdministradorListado | null>(null);
  const [revogando, setRevogando] = useState(false);
  const [erroRevogar, setErroRevogar] = useState<string | null>(null);

  const [editandoWhatsapp, setEditandoWhatsapp] = useState<{ id: string; valor: string } | null>(null);
  const [salvandoWhatsapp, setSalvandoWhatsapp] = useState(false);
  const [erroWhatsapp, setErroWhatsapp] = useState<string | null>(null);

  async function salvarWhatsapp(): Promise<void> {
    if (!editandoWhatsapp) return;
    setSalvandoWhatsapp(true);
    setErroWhatsapp(null);
    const resultado = await patch(`/api/admin/administradores/${editandoWhatsapp.id}`, { whatsapp: editandoWhatsapp.valor });
    setSalvandoWhatsapp(false);
    if (!resultado.ok) {
      setErroWhatsapp(resultado.erro.detalhes?.whatsapp ?? resultado.erro.mensagem);
      return;
    }
    setEditandoWhatsapp(null);
    administradores.recarregar();
  }

  async function convidar(): Promise<void> {
    setEnviando(true);
    setErro(null);
    setSucesso(null);

    const resultado = await post<{ administrador: { email: string | null } }>('/api/admin/administradores', {
      email: email.trim(),
      whatsapp: whatsapp.trim(),
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
    setWhatsapp('');
    administradores.recarregar();
  }

  async function confirmarRevogar(): Promise<void> {
    if (!paraRevogar) return;
    setRevogando(true);
    setErroRevogar(null);
    const resultado = await del(`/api/admin/administradores/${paraRevogar.id}`);
    setRevogando(false);
    if (!resultado.ok) {
      setErroRevogar(resultado.erro.mensagem);
      return;
    }
    setParaRevogar(null);
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
          <label className="flex flex-col text-sm">
            WhatsApp
            <input
              type="tel"
              required
              placeholder="(11) 98765-4321"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-48 rounded border border-slate-300 p-2"
            />
          </label>
          <Button type="submit" disabled={enviando || !email.trim() || !whatsapp.trim()} aria-busy={enviando}>
            {enviando ? 'Enviando…' : 'Enviar convite'}
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          O convite chega por e-mail com um link para definir a senha. Todo login pede também um código enviado para o
          WhatsApp informado aqui. Se o e-mail não
          chegar (ex.: ambiente de teste), o convidado pode entrar por <code>/admin/primeiro-acesso</code> com a senha
          temporária recebida.
        </p>
        {erro ? (
          <p role="alert" className="mt-2 text-sm text-red-800">
            {erro.detalhes?.whatsapp ?? erro.mensagem}
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
                  <th className="p-2">Status</th>
                  <th className="p-2">Convidado em</th>
                  <th className="p-2">Último acesso</th>
                  <th className="p-2">WhatsApp</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {administradores.dados.itens.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="p-2 font-medium text-slate-900">{a.nome ?? '—'}</td>
                    <td className="p-2">{a.email ?? '—'}</td>
                    <td className="p-2">
                      {a.pendente ? (
                        <Badge variant="secondary">Convite pendente</Badge>
                      ) : (
                        <Badge variant="default">Ativo</Badge>
                      )}
                    </td>
                    <td className="p-2">{formatarData(a.criadoEm)}</td>
                    <td className="p-2">{formatarData(a.ultimoLoginEm)}</td>
                    <td className="p-2">
                      {editandoWhatsapp?.id === a.id ? (
                        <form
                          className="flex flex-col gap-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void salvarWhatsapp();
                          }}
                        >
                          <div className="flex items-center gap-1">
                            <input
                              type="tel"
                              autoFocus
                              placeholder="(11) 98765-4321"
                              value={editandoWhatsapp.valor}
                              onChange={(e) => setEditandoWhatsapp({ id: a.id, valor: e.target.value })}
                              className="w-40 rounded border border-slate-300 p-1"
                            />
                            <Button type="submit" size="sm" disabled={salvandoWhatsapp || !editandoWhatsapp.valor.trim()}>
                              {salvandoWhatsapp ? 'Salvando…' : 'Salvar'}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setEditandoWhatsapp(null)} disabled={salvandoWhatsapp}>
                              Cancelar
                            </Button>
                          </div>
                          {erroWhatsapp ? (
                            <span role="alert" className="text-xs text-red-800">
                              {erroWhatsapp}
                            </span>
                          ) : null}
                        </form>
                      ) : (
                        <div className="flex items-center gap-2">
                          {a.whatsapp ? (
                            <span className="whitespace-nowrap">{formatarWhatsapp(a.whatsapp)}</span>
                          ) : (
                            <Badge variant="secondary">Não cadastrado</Badge>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setErroWhatsapp(null);
                              setEditandoWhatsapp({ id: a.id, valor: a.whatsapp ? formatarWhatsapp(a.whatsapp) : '' });
                            }}
                          >
                            {a.whatsapp ? 'Alterar' : 'Cadastrar'}
                          </Button>
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {a.id !== meuId ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setErroRevogar(null);
                            setParaRevogar(a);
                          }}
                        >
                          {a.pendente ? 'Cancelar convite' : 'Revogar acesso'}
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">Você</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmacaoImpacto
        aberto={paraRevogar !== null}
        titulo={paraRevogar?.pendente ? 'Cancelar convite' : 'Revogar acesso de administrador'}
        mensagem={
          paraRevogar?.pendente
            ? 'Esta pessoa não vai mais conseguir aceitar o convite. Você pode convidar de novo depois, se precisar.'
            : 'Esta pessoa perde o acesso ao painel administrativo imediatamente. Você pode convidá-la de novo depois, se precisar.'
        }
        itens={paraRevogar ? [paraRevogar.email ?? paraRevogar.nome ?? paraRevogar.id] : []}
        carregando={revogando}
        onConfirmar={() => void confirmarRevogar()}
        onCancelar={() => {
          setParaRevogar(null);
          setErroRevogar(null);
        }}
      />
      {erroRevogar ? (
        <p role="alert" className="text-sm text-red-800">
          {erroRevogar}
        </p>
      ) : null}
    </div>
  );
}
