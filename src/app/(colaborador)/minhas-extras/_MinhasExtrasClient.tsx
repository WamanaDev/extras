'use client';

/**
 * `/(colaborador)/minhas-extras` — marcações + cancelamento (API-COL-006/005).
 *
 * Cancelar uma extra é uma ação destrutiva (perde a vaga, pode não haver
 * outra até o fim da janela) — exige `<ConfirmacaoImpacto />` com o impacto
 * listado antes de confirmar (FE-001.6), mesmo sendo só um item.
 * `podeCancelar` vem sempre da API (FE-001.5): o botão de cancelar nem
 * aparece quando a API já decidiu que não pode.
 */
import { useEffect, useState } from 'react';
import { get, del } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmacaoImpacto } from '@/components/comum/ConfirmacaoImpacto';

export interface Marcacao {
  id: string;
  data: string;
  tipo: 'DIURNO' | 'NOTURNO';
  rt: string;
  horaInicio: string;
  horaFim: string;
  status: 'CONFIRMADA' | 'CANCELADA';
  cruzada: boolean;
  criadoEm: string;
  canceladoEm: string | null;
  podeCancelar: boolean;
}

export interface MinhasMarcacoesDados {
  marcacoes: Marcacao[];
  totais: { confirmadas: number; canceladas: number; horas: number };
}

export function MinhasExtrasClient({
  cicloId,
  dadosIniciais,
}: {
  cicloId: string;
  dadosIniciais?: MinhasMarcacoesDados;
}): JSX.Element {
  const [dados, setDados] = useState<MinhasMarcacoesDados | null>(dadosIniciais ?? null);
  const [carregando, setCarregando] = useState(dadosIniciais === undefined);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [paraCancelar, setParaCancelar] = useState<Marcacao | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null);

  async function buscar(): Promise<void> {
    setCarregando(true);
    setErroCarga(null);
    const resultado = await get<MinhasMarcacoesDados>(`/api/minhas-marcacoes?cicloId=${encodeURIComponent(cicloId)}`);
    if (resultado.ok) {
      setDados(resultado.dados);
    } else {
      setErroCarga(resultado.erro.mensagem);
    }
    setCarregando(false);
  }

  useEffect(() => {
    if (dadosIniciais !== undefined) return;
    void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cicloId]);

  async function confirmarCancelamento(): Promise<void> {
    if (!paraCancelar) return;
    setCancelando(true);
    setErroCancelamento(null);
    const resultado = await del<{ id: string; status: string }>(`/api/marcacoes/${paraCancelar.id}`);
    setCancelando(false);
    if (!resultado.ok) {
      // FE-001.4: erro de negócio (JANELA_ENCERRADA, CICLO_FECHADO) fica
      // inline no modal, nunca vira toast e nunca fecha silenciosamente.
      setErroCancelamento(resultado.erro.mensagem);
      return;
    }
    setParaCancelar(null);
    await buscar();
  }

  if (carregando && !dados) {
    return (
      <div role="status" aria-live="polite" className="rounded-lg border border-slate-200 bg-white p-4">
        Carregando suas extras…
      </div>
    );
  }

  if (erroCarga) {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
        {erroCarga}
      </div>
    );
  }

  if (!dados || dados.marcacoes.length === 0) {
    return (
      <div role="status" className="rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
        Você ainda não marcou nenhuma extra neste ciclo.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <dl className="flex flex-wrap gap-4 text-sm text-slate-600">
        <div>
          <dt className="inline font-medium text-slate-900">Confirmadas: </dt>
          <dd className="inline">{dados.totais.confirmadas}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-slate-900">Canceladas: </dt>
          <dd className="inline">{dados.totais.canceladas}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-slate-900">Horas: </dt>
          <dd className="inline">{dados.totais.horas}h</dd>
        </div>
      </dl>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {dados.marcacoes.map((marcacao) => (
          <li key={marcacao.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div>
              <p className="font-medium text-slate-900">
                {marcacao.data} · {marcacao.rt} · {marcacao.tipo === 'DIURNO' ? 'Diurno' : 'Noturno'}
              </p>
              <p className="text-slate-600">
                {marcacao.horaInicio}–{marcacao.horaFim}
                {marcacao.cruzada ? ' · cruzada' : ''}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={marcacao.status === 'CONFIRMADA' ? 'success' : 'secondary'}>
                {marcacao.status === 'CONFIRMADA' ? 'Confirmada' : 'Cancelada'}
              </Badge>
              {marcacao.podeCancelar ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setErroCancelamento(null);
                    setParaCancelar(marcacao);
                  }}
                >
                  Cancelar
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <ConfirmacaoImpacto
        aberto={paraCancelar !== null}
        titulo="Cancelar extra"
        mensagem="Você vai liberar esta vaga para outro colaborador. Esta ação não pode ser desfeita — se mudar de ideia, terá que marcar de novo, se ainda houver vaga."
        itens={
          paraCancelar
            ? [
                `${paraCancelar.data} · ${paraCancelar.rt} · ${paraCancelar.tipo === 'DIURNO' ? 'Diurno' : 'Noturno'} · ${paraCancelar.horaInicio}–${paraCancelar.horaFim}`,
              ]
            : []
        }
        carregando={cancelando}
        onConfirmar={() => void confirmarCancelamento()}
        onCancelar={() => {
          setParaCancelar(null);
          setErroCancelamento(null);
        }}
      />
      {erroCancelamento ? (
        <p role="alert" className="text-sm text-red-700">
          {erroCancelamento}
        </p>
      ) : null}
    </div>
  );
}
