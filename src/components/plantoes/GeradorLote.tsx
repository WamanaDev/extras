'use client';

import { useState } from 'react';
import { post, type ErroApi } from '@/lib/api/client';
import { Button } from '@/components/ui/button';

export interface RtOpcao {
  id: string;
  nome: string;
}

export interface ItemPreviewLote {
  data: string;
  tipo: 'DIURNO' | 'NOTURNO';
  rt: string;
  vagas: number;
}

export interface ItemIgnoradoLote {
  data: string;
  tipo: 'DIURNO' | 'NOTURNO';
  rt: string;
  motivo: 'JA_EXISTE' | 'FORA_DO_CICLO';
}

interface RespostaLote {
  criados: number;
  ignorados: ItemIgnoradoLote[];
  preview?: ItemPreviewLote[];
}

/**
 * `<GeradorLote />` — FE-002.
 *
 * Intervalo × turnos × RT × vagas (`API-ADM-PLA-002 POST
 * /api/admin/plantoes/lote`). O `preview` é obrigatório antes de gravar: o
 * botão "Gerar" só fica habilitado depois que a última chamada com
 * `preview: true` foi bem-sucedida para os parâmetros atuais — qualquer
 * mudança no formulário invalida o preview e exige rodar de novo.
 */
export interface GeradorLoteProps {
  cicloId: string;
  rts: RtOpcao[];
}

interface FormularioLote {
  rtIds: string[];
  de: string;
  ate: string;
  tipos: Array<'DIURNO' | 'NOTURNO'>;
  vagasTotais: number;
  paridade: 'AMBOS' | 'PAR' | 'IMPAR';
}

export function GeradorLote({ cicloId, rts }: GeradorLoteProps): JSX.Element {
  const [form, setForm] = useState<FormularioLote>({ rtIds: [], de: '', ate: '', tipos: [], vagasTotais: 1, paridade: 'AMBOS' });
  const [preview, setPreview] = useState<RespostaLote | null>(null);
  const [previewValidoPara, setPreviewValidoPara] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [resultado, setResultado] = useState<RespostaLote | null>(null);

  const assinaturaForm = JSON.stringify(form);
  const previewValido = preview !== null && previewValidoPara === assinaturaForm;

  function atualizarForm(parcial: Partial<FormularioLote>): void {
    setForm((atual) => ({ ...atual, ...parcial }));
    setPreview(null);
    setPreviewValidoPara(null);
    setErro(null);
    setResultado(null);
  }

  function alternarSelecao<T>(lista: T[], valor: T): T[] {
    return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
  }

  function formularioValido(): boolean {
    return form.rtIds.length > 0 && form.tipos.length > 0 && form.de !== '' && form.ate !== '' && form.vagasTotais > 0;
  }

  async function rodarPreview(): Promise<void> {
    if (!formularioValido()) return;
    setCarregando(true);
    setErro(null);
    const resultadoChamada = await post<RespostaLote>('/api/admin/plantoes/lote', {
      cicloId,
      rtIds: form.rtIds,
      de: form.de,
      ate: form.ate,
      tipos: form.tipos,
      vagasTotais: form.vagasTotais,
      paridade: form.paridade,
      preview: true,
    });
    setCarregando(false);
    if (resultadoChamada.ok) {
      setPreview(resultadoChamada.dados);
      setPreviewValidoPara(assinaturaForm);
    } else {
      setErro(resultadoChamada.erro);
    }
  }

  async function gravar(): Promise<void> {
    if (!previewValido) return;
    setCarregando(true);
    setErro(null);
    const resultadoChamada = await post<RespostaLote>('/api/admin/plantoes/lote', {
      cicloId,
      rtIds: form.rtIds,
      de: form.de,
      ate: form.ate,
      tipos: form.tipos,
      vagasTotais: form.vagasTotais,
      paridade: form.paridade,
      preview: false,
    });
    setCarregando(false);
    if (resultadoChamada.ok) {
      setResultado(resultadoChamada.dados);
      setPreview(null);
      setPreviewValidoPara(null);
    } else {
      // FE-001.4: erro de negócio (ex.: teto de lote excedido) fica inline, não em toast.
      setErro(resultadoChamada.erro);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        void rodarPreview();
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-900">RTs</legend>
        <div className="flex flex-wrap gap-2">
          {rts.map((rt) => (
            <label key={rt.id} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={form.rtIds.includes(rt.id)}
                onChange={() => atualizarForm({ rtIds: alternarSelecao(form.rtIds, rt.id) })}
              />
              {rt.nome}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-4">
        <label className="flex flex-col text-sm">
          De
          <input
            type="date"
            value={form.de}
            onChange={(evento) => atualizarForm({ de: evento.target.value })}
            className="rounded border border-slate-300 p-1"
          />
        </label>
        <label className="flex flex-col text-sm">
          Até
          <input
            type="date"
            value={form.ate}
            onChange={(evento) => atualizarForm({ ate: evento.target.value })}
            className="rounded border border-slate-300 p-1"
          />
        </label>
        <label className="flex flex-col text-sm">
          Vagas por plantão
          <input
            type="number"
            min={1}
            value={form.vagasTotais}
            onChange={(evento) => atualizarForm({ vagasTotais: Number(evento.target.value) })}
            className="w-24 rounded border border-slate-300 p-1"
          />
        </label>
        <label className="flex flex-col text-sm">
          Dias do mês
          <select
            value={form.paridade}
            onChange={(evento) => atualizarForm({ paridade: evento.target.value as FormularioLote['paridade'] })}
            className="rounded border border-slate-300 p-1"
          >
            <option value="AMBOS">Ambos</option>
            <option value="PAR">Só pares</option>
            <option value="IMPAR">Só ímpares</option>
          </select>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-900">Turnos</legend>
        <div className="flex gap-3">
          {(['DIURNO', 'NOTURNO'] as const).map((tipo) => (
            <label key={tipo} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={form.tipos.includes(tipo)}
                onChange={() => atualizarForm({ tipos: alternarSelecao(form.tipos, tipo) })}
              />
              {tipo === 'DIURNO' ? 'Diurno' : 'Noturno'}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" variant="outline" disabled={!formularioValido() || carregando}>
          {carregando ? 'Calculando…' : 'Pré-visualizar'}
        </Button>
        <Button
          type="button"
          onClick={() => void gravar()}
          disabled={!previewValido || carregando}
          title={!previewValido ? 'Rode a pré-visualização com os parâmetros atuais antes de gravar.' : undefined}
        >
          Gerar plantões
        </Button>
      </div>

      {erro ? (
        <p role="alert" className="text-sm text-red-800">
          {erro.mensagem}
        </p>
      ) : null}

      {preview ? (
        <div role="status" className="rounded-lg border border-slate-200 p-3 text-sm" data-testid="preview-lote">
          <p>
            Serão criados <strong>{preview.preview?.length ?? 0}</strong> plantão(ões); <strong>{preview.ignorados.length}</strong>{' '}
            serão ignorados.
          </p>
          {preview.ignorados.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-slate-600">
              {preview.ignorados.slice(0, 10).map((item, indice) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={indice}>
                  {item.data} · {item.tipo} · {item.rt} — {item.motivo === 'JA_EXISTE' ? 'já existe' : 'fora do ciclo'}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {resultado ? (
        <p role="status" className="text-sm text-emerald-800">
          {resultado.criados} plantão(ões) criado(s); {resultado.ignorados.length} ignorado(s).
        </p>
      ) : null}
    </form>
  );
}
