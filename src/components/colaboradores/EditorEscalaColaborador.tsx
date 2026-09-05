'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { previewMeses, type Paridade } from '@/lib/escala/ancora';
import { post, type ErroApi } from '@/lib/api/client';
import { Button } from '@/components/ui/button';

/**
 * `<EditorEscalaColaborador />` — FE-002.
 *
 * Turno, âncora e periodicidade, com **preview de 3 meses** mostrando a
 * virada de paridade — a defesa contra o erro mais caro do cadastro: uma
 * âncora um dia deslocada inverte todos os plantões da pessoa, e sem o
 * preview isso só aparece na escala impressa, semanas depois.
 *
 * O preview é calculado no cliente com `previewMeses`
 * (`src/lib/escala/ancora.ts`, DOM-001) — a mesma função pura que
 * `API-ADM-COL-006 POST /.../trocar-escala` usa para devolver
 * `previewMeses` na resposta (FE-4: os dois batem, por construção, porque
 * são a mesma função). O preview aqui é só antecipação de UI (D-01); a
 * gravação de fato é sempre a chamada à API, nunca decidida no cliente.
 */
export interface EditorEscalaColaboradorProps {
  colaboradorId: string;
  vigenciaInicioPadrao?: string;
}

interface Formulario {
  turno: 'DIURNO' | 'NOTURNO';
  ancora: string;
  periodo: number;
  vigenciaInicio: string;
  motivo: string;
}

export function EditorEscalaColaborador({ colaboradorId, vigenciaInicioPadrao }: EditorEscalaColaboradorProps): JSX.Element {
  const [form, setForm] = useState<Formulario>({
    turno: 'DIURNO',
    ancora: '',
    periodo: 2,
    vigenciaInicio: vigenciaInicioPadrao ?? '',
    motivo: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [sucesso, setSucesso] = useState<{ previewMeses: Array<{ ano: number; mes: number; dias: number[]; paridade: Paridade }> } | null>(
    null,
  );

  const previewLocal = useMemo(() => {
    if (!form.ancora || !form.vigenciaInicio) return null;
    const ancora = new Date(`${form.ancora}T00:00:00.000Z`);
    const vigencia = new Date(`${form.vigenciaInicio}T00:00:00.000Z`);
    if (Number.isNaN(ancora.getTime()) || Number.isNaN(vigencia.getTime())) return null;
    return previewMeses(ancora, form.periodo, vigencia.getUTCFullYear(), vigencia.getUTCMonth() + 1, 3);
  }, [form.ancora, form.vigenciaInicio, form.periodo]);

  async function salvar(): Promise<void> {
    setEnviando(true);
    setErro(null);
    const resultado = await post<{ previewMeses: Array<{ ano: number; mes: number; dias: number[]; paridade: Paridade }> }>(
      `/api/admin/colaboradores/${colaboradorId}/trocar-escala`,
      {
        vigenciaInicio: form.vigenciaInicio,
        turno: form.turno,
        ancora: form.ancora,
        periodo: form.periodo,
        motivo: form.motivo,
      },
    );
    setEnviando(false);
    if (resultado.ok) {
      setSucesso(resultado.dados);
    } else {
      setErro(resultado.erro);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        void salvar();
      }}
    >
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col text-sm">
          Turno
          <select
            value={form.turno}
            onChange={(evento) => setForm((atual) => ({ ...atual, turno: evento.target.value as 'DIURNO' | 'NOTURNO' }))}
            className="rounded border border-slate-300 p-1"
          >
            <option value="DIURNO">Diurno</option>
            <option value="NOTURNO">Noturno</option>
          </select>
        </label>

        <label className="flex flex-col text-sm">
          Âncora (data em que trabalha)
          <input
            type="date"
            value={form.ancora}
            onChange={(evento) => setForm((atual) => ({ ...atual, ancora: evento.target.value }))}
            className="rounded border border-slate-300 p-1"
          />
        </label>

        <label className="flex flex-col text-sm">
          Periodicidade (dias)
          <input
            type="number"
            min={1}
            value={form.periodo}
            onChange={(evento) => setForm((atual) => ({ ...atual, periodo: Number(evento.target.value) }))}
            className="w-20 rounded border border-slate-300 p-1"
          />
        </label>

        <label className="flex flex-col text-sm">
          Vigência a partir de
          <input
            type="date"
            value={form.vigenciaInicio}
            onChange={(evento) => setForm((atual) => ({ ...atual, vigenciaInicio: evento.target.value }))}
            className="rounded border border-slate-300 p-1"
          />
        </label>

        <label className="flex flex-1 flex-col text-sm">
          Motivo
          <input
            type="text"
            value={form.motivo}
            onChange={(evento) => setForm((atual) => ({ ...atual, motivo: evento.target.value }))}
            className="rounded border border-slate-300 p-1"
          />
        </label>
      </div>

      {previewLocal ? (
        <div data-testid="preview-3-meses" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {previewLocal.map((mes) => (
            <div key={`${mes.ano}-${mes.mes}`} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">
                {mes.mes.toString().padStart(2, '0')}/{mes.ano}
                <span
                  className={cn(
                    'ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                    mes.paridade === 'PAR' && 'bg-blue-100 text-blue-900',
                    mes.paridade === 'IMPAR' && 'bg-purple-100 text-purple-900',
                    mes.paridade === 'MISTA' && 'bg-amber-100 text-amber-900',
                  )}
                >
                  {mes.paridade === 'MISTA' ? 'vira paridade' : mes.paridade === 'PAR' ? 'dias pares' : 'dias ímpares'}
                </span>
              </p>
              <p className="mt-1 text-slate-600">{mes.dias.length} dia(s) trabalhado(s): {mes.dias.join(', ') || '—'}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Preencha âncora e vigência para ver o preview de 3 meses antes de salvar.</p>
      )}

      <Button type="submit" disabled={!previewLocal || form.motivo.trim() === '' || enviando}>
        {enviando ? 'Salvando…' : 'Salvar troca de escala'}
      </Button>

      {erro ? (
        <p role="alert" className="text-sm text-red-800">
          {erro.mensagem}
        </p>
      ) : null}

      {sucesso ? (
        <p role="status" className="text-sm text-emerald-800">
          Troca salva. A escala será regenerada conforme o novo preview.
        </p>
      ) : null}
    </form>
  );
}
