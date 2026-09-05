'use client';

import { useEffect, useState } from 'react';
import { del, get, patch, post, type ErroApi } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface CodigoEscalaLinha {
  id: string;
  codigo: string;
  descricao: string;
  presenca: boolean;
  ocupaHorario: boolean;
  remunerada: boolean;
  ativo: boolean;
  bloqueado: boolean;
  cor: string;
}

interface NovoCodigoForm {
  codigo: string;
  descricao: string;
  presenca: boolean;
  ocupaHorario: boolean;
  remunerada: boolean;
  cor: string;
}

const FORM_VAZIO: NovoCodigoForm = { codigo: '', descricao: '', presenca: false, ocupaHorario: false, remunerada: false, cor: '#1565C0' };

/**
 * `<CodigosEscala />` — gestão dinâmica de motivo de ausência (DOM-003,
 * pedido do usuário: "implementar configuração de motivo de ausência de
 * forma dinâmica").
 *
 * `D` (Disponível), `F` (Folga) e `FE` (Férias) são fixos/`bloqueado` —
 * nascem assim pelo seed (`_conflitos.md`, DOM-003.6 revisado) e nenhuma
 * rota de API permite alterar descrição/flags/status dessa coluna. Aqui eles
 * aparecem com um selo "Fixo" e sem botões de editar/desativar — mas a
 * **cor** continua editável mesmo bloqueado (pedido do usuário: legenda/badge
 * de um código fixo ainda pode ser personalizada visualmente, sem abrir a
 * porta pra mexer em regra de negócio). Qualquer outro código (incluindo
 * `FT`, que deixou de ser especial) pode ser criado, editado e desativado
 * livremente pelo admin.
 */
export function CodigosEscala(): JSX.Element {
  const [codigos, setCodigos] = useState<CodigoEscalaLinha[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [form, setForm] = useState<NovoCodigoForm>(FORM_VAZIO);
  const [erroForm, setErroForm] = useState<ErroApi | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [descricaoEdicao, setDescricaoEdicao] = useState('');
  /** Cor escolhida no seletor mas ainda não enviada (só vira PATCH ao clicar no ✓) — ver doc-comment do componente. */
  const [coresPendentes, setCoresPendentes] = useState<Record<string, string>>({});
  const [salvandoCorId, setSalvandoCorId] = useState<string | null>(null);

  async function recarregar(): Promise<void> {
    // `GET /api/admin/codigos-escala` responde `Cache-Control: private,
    // max-age=300` (`cache: 'referencia'`, pensado pra preencher <select>
    // sem bater no banco toda hora) — mas esta tela precisa ver o resultado
    // de uma mutação imediatamente depois de salvar, então força bypass do
    // cache HTTP do navegador (achado em uso real: sem isso, a cor só
    // atualizava na tela depois de um F5).
    const resultado = await get<{ itens: CodigoEscalaLinha[] }>('/api/admin/codigos-escala?todos=true', { cache: 'no-store' });
    if (resultado.ok) setCodigos(resultado.dados.itens);
    else setErroCarga(resultado.erro.mensagem);
  }

  useEffect(() => {
    void recarregar();
  }, []);

  async function criar(): Promise<void> {
    setSalvando(true);
    setErroForm(null);
    const resultado = await post<CodigoEscalaLinha>('/api/admin/codigos-escala', form);
    setSalvando(false);
    if (resultado.ok) {
      setForm(FORM_VAZIO);
      await recarregar();
    } else {
      setErroForm(resultado.erro);
    }
  }

  async function salvarEdicao(id: string): Promise<void> {
    setSalvando(true);
    setErroForm(null);
    const resultado = await patch<CodigoEscalaLinha>(`/api/admin/codigos-escala/${id}`, { descricao: descricaoEdicao });
    setSalvando(false);
    if (resultado.ok) {
      setEditandoId(null);
      await recarregar();
    } else {
      setErroForm(resultado.erro);
    }
  }

  async function alternarAtivo(codigo: CodigoEscalaLinha): Promise<void> {
    setErroForm(null);
    const resultado = codigo.ativo
      ? await del<{ id: string; ativo: boolean }>(`/api/admin/codigos-escala/${codigo.id}`)
      : await patch<CodigoEscalaLinha>(`/api/admin/codigos-escala/${codigo.id}`, { ativo: true });
    if (resultado.ok) await recarregar();
    else setErroForm(resultado.erro);
  }

  /**
   * Confirma a cor pendente do seletor (botão ✓) — só aqui sai o PATCH.
   * O `onChange` do `<input type="color">` só atualiza `coresPendentes`
   * (estado local), pra não bater no banco a cada arrasto no seletor
   * (pedido do usuário: "vamos sobrecarregar o banco com alterações de
   * cores"). Único campo que um código `bloqueado` (D/F/FE) aceita alterar
   * — ver `[id]/_impl.ts`.
   */
  async function confirmarCor(id: string): Promise<void> {
    const novaCor = coresPendentes[id];
    if (novaCor === undefined) return;
    setSalvandoCorId(id);
    setErroForm(null);
    const resultado = await patch<CodigoEscalaLinha>(`/api/admin/codigos-escala/${id}`, { cor: novaCor });
    setSalvandoCorId(null);
    if (resultado.ok) {
      setCoresPendentes((atual) => {
        const { [id]: _removida, ...resto } = atual;
        return resto;
      });
      await recarregar();
    } else {
      setErroForm(resultado.erro);
    }
  }

  const formularioValido = form.codigo.trim() !== '' && form.descricao.trim() !== '' && /^#[0-9A-Fa-f]{6}$/.test(form.cor);

  return (
    <section className="space-y-4 rounded-lg border border-slate-300 p-4" aria-label="Motivos de ausência (códigos de escala)">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Motivos de ausência</h2>
        <p className="text-sm text-slate-600">
          <strong>D</strong> (Disponível), <strong>F</strong> (Folga) e <strong>FE</strong> (Férias) são fixos e não podem ser alterados nem
          desativados. Cadastre outros motivos (atestado, licença, treinamento etc.) livremente.
        </p>
      </div>

      {erroCarga ? (
        <p role="alert" className="text-sm text-red-800">
          {erroCarga}
        </p>
      ) : null}

      {codigos === null ? (
        <p role="status">Carregando…</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2 text-left">Código</th>
                <th className="p-2 text-left">Descrição</th>
                <th className="p-2 text-center">Cor</th>
                <th className="p-2 text-center">Cobre plantão</th>
                <th className="p-2 text-center">Ocupa horário</th>
                <th className="p-2 text-center">Remunerada</th>
                <th className="p-2 text-center">Status</th>
                <th className="p-2 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              {codigos.map((codigo) => (
                <tr key={codigo.id} className="border-t border-slate-100">
                  <td className="p-2 font-mono font-semibold" style={{ color: codigo.cor }}>
                    {codigo.codigo}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center justify-center gap-1">
                      <input
                        type="color"
                        value={coresPendentes[codigo.id] ?? codigo.cor}
                        aria-label={`Cor de ${codigo.codigo}`}
                        onChange={(evento) => setCoresPendentes((atual) => ({ ...atual, [codigo.id]: evento.target.value }))}
                        className="h-7 w-10 rounded border border-slate-300"
                      />
                      {coresPendentes[codigo.id] !== undefined && coresPendentes[codigo.id] !== codigo.cor ? (
                        <>
                          <button
                            type="button"
                            aria-label={`Confirmar cor de ${codigo.codigo}`}
                            title="Confirmar cor"
                            disabled={salvandoCorId === codigo.id}
                            onClick={() => void confirmarCor(codigo.id)}
                            className="flex h-6 w-6 items-center justify-center rounded border border-emerald-600 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            aria-label={`Cancelar cor de ${codigo.codigo}`}
                            title="Cancelar"
                            disabled={salvandoCorId === codigo.id}
                            onClick={() =>
                              setCoresPendentes((atual) => {
                                const { [codigo.id]: _removida, ...resto } = atual;
                                return resto;
                              })
                            }
                            className="flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            ✕
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-2">
                    {editandoId === codigo.id ? (
                      <input
                        value={descricaoEdicao}
                        onChange={(evento) => setDescricaoEdicao(evento.target.value)}
                        className="w-full rounded border border-slate-300 p-1"
                      />
                    ) : (
                      codigo.descricao
                    )}
                  </td>
                  <td className="p-2 text-center">{codigo.presenca ? 'Sim' : 'Não'}</td>
                  <td className="p-2 text-center">{codigo.ocupaHorario ? 'Sim' : 'Não'}</td>
                  <td className="p-2 text-center">{codigo.remunerada ? 'Sim' : 'Não'}</td>
                  <td className="p-2 text-center">
                    {codigo.bloqueado ? (
                      <Badge variant="secondary">Fixo</Badge>
                    ) : codigo.ativo ? (
                      <Badge variant="default">Ativo</Badge>
                    ) : (
                      <Badge variant="warning">Desativado</Badge>
                    )}
                  </td>
                  <td className="p-2">
                    {codigo.bloqueado ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : editandoId === codigo.id ? (
                      <div className="flex gap-1">
                        <Button size="sm" disabled={salvando} onClick={() => void salvarEdicao(codigo.id)}>
                          Salvar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditandoId(null)}>
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditandoId(codigo.id);
                            setDescricaoEdicao(codigo.descricao);
                          }}
                        >
                          Editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void alternarAtivo(codigo)}>
                          {codigo.ativo ? 'Desativar' : 'Reativar'}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        className="space-y-3 border-t border-slate-200 pt-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          void criar();
        }}
      >
        <h3 className="text-sm font-medium text-slate-900">Novo motivo de ausência</h3>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col text-sm">
            Código
            <input
              value={form.codigo}
              onChange={(evento) => setForm((atual) => ({ ...atual, codigo: evento.target.value }))}
              maxLength={8}
              placeholder="ex.: ATEST"
              className="w-28 rounded border border-slate-300 p-1"
            />
          </label>
          <label className="flex flex-1 min-w-[200px] flex-col text-sm">
            Descrição
            <input
              value={form.descricao}
              onChange={(evento) => setForm((atual) => ({ ...atual, descricao: evento.target.value }))}
              placeholder="ex.: Atestado médico"
              className="rounded border border-slate-300 p-1"
            />
          </label>
          <label className="flex flex-col text-sm">
            Cor
            <input
              type="color"
              value={form.cor}
              onChange={(evento) => setForm((atual) => ({ ...atual, cor: evento.target.value }))}
              className="h-9 w-14 rounded border border-slate-300"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={form.presenca} onChange={(evento) => setForm((atual) => ({ ...atual, presenca: evento.target.checked }))} />
            Cobre o plantão (conta na cobertura mínima)
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={form.ocupaHorario}
              onChange={(evento) => setForm((atual) => ({ ...atual, ocupaHorario: evento.target.checked }))}
            />
            Ocupa horário (não conta como descanso)
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={form.remunerada} onChange={(evento) => setForm((atual) => ({ ...atual, remunerada: evento.target.checked }))} />
            Remunerada
          </label>
        </div>

        {erroForm ? (
          <p role="alert" className="text-sm text-red-800">
            {erroForm.mensagem}
          </p>
        ) : null}

        <Button type="submit" disabled={!formularioValido || salvando}>
          {salvando ? 'Salvando…' : 'Cadastrar motivo'}
        </Button>
      </form>
    </section>
  );
}
