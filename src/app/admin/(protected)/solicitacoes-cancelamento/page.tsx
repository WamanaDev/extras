'use client';

/**
 * `/admin/solicitacoes-cancelamento` — pedido do usuário, sem spec de API
 * própria ainda (ver `_conflitos.md`): colaborador não cancela mais a
 * própria extra direto, abre um pedido aqui revisado por QUALQUER admin
 * (não um específico) — aprovar chama `cancelar_extra` (FN-006) por baixo;
 * recusar só marca o pedido como resolvido, a marcação continua confirmada.
 */
import { useState } from 'react';
import { useListaApi } from '@/lib/api/use-recurso';
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/admin/Estado';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { post, type ErroApi } from '@/lib/api/client';

interface SolicitacaoListada {
  id: string;
  colaborador: { id: string; nome: string; matricula: string };
  marcacao: { id: string; data: string; tipo: 'DIURNO' | 'NOTURNO'; rt: string; horaInicio: string; horaFim: string };
  motivo: string;
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA';
  motivoResolucao: string | null;
  criadoEm: string;
  resolvidoEm: string | null;
}

const FILTROS = [
  { valor: 'PENDENTE', rotulo: 'Pendentes' },
  { valor: 'APROVADA', rotulo: 'Aprovadas' },
  { valor: 'RECUSADA', rotulo: 'Recusadas' },
  { valor: '', rotulo: 'Todas' },
] as const;

export default function SolicitacoesCancelamentoPage(): JSX.Element {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['valor']>('PENDENTE');
  const solicitacoes = useListaApi<SolicitacaoListada>(
    `/api/admin/solicitacoes-cancelamento?tamanho=100${filtro ? `&status=${filtro}` : ''}`,
  );

  const [paraRecusar, setParaRecusar] = useState<SolicitacaoListada | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erroPorItem, setErroPorItem] = useState<Record<string, string>>({});

  async function aprovar(solicitacao: SolicitacaoListada): Promise<void> {
    setEnviando(solicitacao.id);
    setErroPorItem((atual) => ({ ...atual, [solicitacao.id]: '' }));
    const resultado = await post<{ status: string }>(`/api/admin/solicitacoes-cancelamento/${solicitacao.id}/aprovar`, {});
    setEnviando(null);
    if (resultado.ok) {
      solicitacoes.recarregar();
    } else {
      setErroPorItem((atual) => ({ ...atual, [solicitacao.id]: resultado.erro.mensagem }));
    }
  }

  function abrirRecusa(solicitacao: SolicitacaoListada): void {
    setMotivoRecusa('');
    setParaRecusar(solicitacao);
  }

  async function confirmarRecusa(): Promise<void> {
    if (!paraRecusar || motivoRecusa.trim() === '') return;
    setEnviando(paraRecusar.id);
    const resultado = await post<{ status: string }>(`/api/admin/solicitacoes-cancelamento/${paraRecusar.id}/recusar`, {
      motivoResolucao: motivoRecusa.trim(),
    });
    setEnviando(null);
    if (resultado.ok) {
      setParaRecusar(null);
      setMotivoRecusa('');
      solicitacoes.recarregar();
    } else {
      setErroPorItem((atual) => ({ ...atual, [paraRecusar.id]: resultado.erro.mensagem }));
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Pedidos de cancelamento de extra</h1>
      <p className="text-sm text-slate-600">
        Colaboradores não cancelam mais a própria extra direto — cada pedido abaixo precisa da aprovação de um admin
        (qualquer um). Aprovar cancela a extra de fato; recusar mantém a extra confirmada.
      </p>

      <div className="flex gap-2">
        {FILTROS.map((item) => (
          <Button key={item.valor} variant={filtro === item.valor ? 'default' : 'outline'} size="sm" onClick={() => setFiltro(item.valor)}>
            {item.rotulo}
          </Button>
        ))}
      </div>

      {solicitacoes.carregando ? (
        <EstadoCarregando />
      ) : solicitacoes.erro ? (
        <EstadoErro mensagem={solicitacoes.erro} />
      ) : !solicitacoes.dados || solicitacoes.dados.itens.length === 0 ? (
        <EstadoVazio texto="Nenhum pedido de cancelamento nesse filtro." />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {solicitacoes.dados.itens.map((solicitacao) => (
            <li key={solicitacao.id} className="flex flex-wrap items-start justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-medium text-slate-900">
                  {solicitacao.colaborador.nome} <span className="text-slate-400">#{solicitacao.colaborador.matricula}</span>
                </p>
                <p className="text-slate-600">
                  {solicitacao.marcacao.data} · {solicitacao.marcacao.rt} · {solicitacao.marcacao.tipo === 'DIURNO' ? 'Diurno' : 'Noturno'} ·{' '}
                  {solicitacao.marcacao.horaInicio}–{solicitacao.marcacao.horaFim}
                </p>
                <p className="mt-1 text-slate-700">
                  <span className="font-medium">Motivo do colaborador:</span> {solicitacao.motivo}
                </p>
                {solicitacao.motivoResolucao ? (
                  <p className="mt-1 text-slate-500">
                    <span className="font-medium">Resolução:</span> {solicitacao.motivoResolucao}
                  </p>
                ) : null}
                {erroPorItem[solicitacao.id] ? (
                  <p role="alert" className="mt-1 text-red-700">
                    {erroPorItem[solicitacao.id]}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Badge
                  variant={solicitacao.status === 'PENDENTE' ? 'outline' : solicitacao.status === 'APROVADA' ? 'success' : 'secondary'}
                >
                  {solicitacao.status === 'PENDENTE' ? 'Pendente' : solicitacao.status === 'APROVADA' ? 'Aprovada' : 'Recusada'}
                </Badge>
                {solicitacao.status === 'PENDENTE' ? (
                  <>
                    <Button size="sm" onClick={() => void aprovar(solicitacao)} disabled={enviando === solicitacao.id}>
                      Aprovar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => abrirRecusa(solicitacao)} disabled={enviando === solicitacao.id}>
                      Recusar
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog aberto={paraRecusar !== null} onFechar={() => setParaRecusar(null)} titulo="Recusar pedido de cancelamento">
        <p className="text-sm text-slate-600">
          Explique por que o pedido não foi aceito — o colaborador vê este motivo. A extra continua confirmada.
        </p>
        <label className="mt-4 flex flex-col text-sm text-slate-800">
          Motivo da recusa
          <textarea
            value={motivoRecusa}
            onChange={(evento) => setMotivoRecusa(evento.target.value)}
            rows={3}
            className="mt-1 rounded border border-slate-300 p-2"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setParaRecusar(null)} disabled={enviando !== null}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={() => void confirmarRecusa()}
            disabled={enviando !== null || motivoRecusa.trim() === ''}
          >
            {enviando !== null ? 'Enviando…' : 'Confirmar recusa'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
