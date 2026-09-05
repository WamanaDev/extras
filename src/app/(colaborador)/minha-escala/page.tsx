/**
 * `/(colaborador)/minha-escala` — calendário: base + extras + ausências (API-COL-002).
 *
 * Server Component. `escala_dia.observacao` nunca é exposta pela API
 * (motivo de ausência é dado de saúde — `API-COL-002`, "CIA"); esta página
 * também não tenta adivinhar/derivar isso, só mostra o `codigo`/`descricaoCodigo`
 * que a API já filtrou.
 */
import { getServidor } from '@/lib/api/servidor';
import { Badge } from '@/components/ui/badge';

interface CicloAtual {
  id: string;
  ano: number;
  mes: number;
  janela: { abertura: string; fechamento: string; estado: 'ANTES' | 'ABERTA' | 'ENCERRADA' };
  permiteCruzada: boolean;
  servidorEm: string;
}

interface DiaEscala {
  data: string;
  turno: 'DIURNO' | 'NOTURNO';
  codigo: string;
  descricaoCodigo: string;
  presenca: boolean;
  horaInicio: string | null;
  horaFim: string | null;
  extra?: { plantaoId: string; rt: string; tipo: 'DIURNO' | 'NOTURNO'; horaInicio: string; horaFim: string };
}

interface MinhaEscala {
  ciclo: { ano: number; mes: number };
  dias: DiaEscala[];
  totais: { escalados: number; extras: number; horas: number };
}

interface MarcacaoHistorico {
  id: string;
  data: string;
  tipo: 'DIURNO' | 'NOTURNO';
  rt: string;
  horaInicio: string;
  horaFim: string;
  status: 'CONFIRMADA' | 'CANCELADA';
  cruzada: boolean;
}

interface MinhasMarcacoesResposta {
  marcacoes: MarcacaoHistorico[];
  totais: { confirmadas: number; canceladas: number; horas: number };
}

export default async function MinhaEscalaPage(): Promise<JSX.Element> {
  const cicloResultado = await getServidor<CicloAtual | null>('/api/ciclos/atual');

  if (!cicloResultado.ok) {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
        {cicloResultado.erro.mensagem}
      </div>
    );
  }

  const ciclo = cicloResultado.dados;
  if (!ciclo) {
    return (
      <div role="status" className="rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
        Nenhum ciclo publicado no momento.
      </div>
    );
  }

  const escalaResultado = await getServidor<MinhaEscala>(`/api/minha-escala?cicloId=${encodeURIComponent(ciclo.id)}`);

  if (!escalaResultado.ok) {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
        {escalaResultado.erro.mensagem}
      </div>
    );
  }

  const { dias, totais } = escalaResultado.dados;

  // Pedido do usuário: as extras confirmadas do ciclo aparecem também numa
  // lista separada aqui (dia, horário, RT — "local"), além do que já aparece
  // inline na coluna "Extra" da tabela de dias. Mesma rota que `/minhas-extras`
  // (`API-COL-006`) já usa — não duplica lógica de negócio, só reaproveita.
  const marcacoesResultado = await getServidor<MinhasMarcacoesResposta>(`/api/minhas-marcacoes?cicloId=${encodeURIComponent(ciclo.id)}`);
  const extrasConfirmadas = marcacoesResultado.ok
    ? marcacoesResultado.dados.marcacoes.filter((m) => m.status === 'CONFIRMADA')
    : [];

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-lg font-semibold text-slate-900">
          Minha escala — {String(ciclo.mes).padStart(2, '0')}/{ciclo.ano}
        </h1>
        <dl className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
          <div>
            <dt className="inline font-medium text-slate-900">Escalados: </dt>
            <dd className="inline">{totais.escalados}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-slate-900">Extras: </dt>
            <dd className="inline">{totais.extras}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-slate-900">Horas: </dt>
            <dd className="inline">{totais.horas}h</dd>
          </div>
        </dl>
      </section>

      {dias.length === 0 ? (
        <div role="status" className="rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
          Sua escala ainda não foi gerada para este ciclo.
        </div>
      ) : (
        <>
          {/* Mobile-first: lista de cartões (uma coluna, sem scroll horizontal) até `sm`; tabela a partir daí. */}
          <ul className="space-y-2 sm:hidden">
            {dias.map((dia) => (
              <li key={dia.data} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{dia.data}</span>
                  <Badge variant={dia.presenca ? 'default' : 'secondary'} title={dia.descricaoCodigo}>
                    {dia.codigo}
                  </Badge>
                </div>
                <p className="mt-1 text-slate-600">{dia.descricaoCodigo}</p>
                <p className="mt-1 text-slate-600">
                  {dia.presenca ? 'Presença' : 'Sem presença'}
                  {dia.presenca && dia.horaInicio && dia.horaFim ? ` · ${dia.horaInicio}–${dia.horaFim}` : ''}
                </p>
                {dia.extra ? (
                  <Badge variant="warning" className="mt-2">
                    Extra {dia.extra.rt} · {dia.extra.horaInicio}–{dia.extra.horaFim}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Data
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Código
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Presença
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Horário
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Extra
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dias.map((dia) => (
                  <tr key={dia.data}>
                    <td className="px-3 py-2 font-medium text-slate-900">{dia.data}</td>
                    <td className="px-3 py-2">
                      <Badge variant={dia.presenca ? 'default' : 'secondary'} title={dia.descricaoCodigo}>
                        {dia.codigo}
                      </Badge>
                      <span className="ml-2 text-slate-600">{dia.descricaoCodigo}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{dia.presenca ? 'Sim' : 'Não'}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {dia.presenca && dia.horaInicio && dia.horaFim ? `${dia.horaInicio}–${dia.horaFim}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {dia.extra ? (
                        <Badge variant="warning">
                          {dia.extra.rt} · {dia.extra.horaInicio}–{dia.extra.horaFim}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <section>
        <h2 className="text-base font-semibold text-slate-900">Minhas extras confirmadas</h2>
        {extrasConfirmadas.length === 0 ? (
          <div role="status" className="mt-2 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Nenhuma extra confirmada neste ciclo.
          </div>
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {extrasConfirmadas.map((marcacao) => (
              <li key={marcacao.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                <div className="flex items-center justify-between font-medium text-slate-900">
                  <span>{marcacao.data}</span>
                  <Badge variant="warning">{marcacao.rt}</Badge>
                </div>
                <p className="mt-1 text-slate-600">
                  {marcacao.tipo === 'DIURNO' ? 'Diurno' : 'Noturno'} · {marcacao.horaInicio}–{marcacao.horaFim}
                </p>
                {marcacao.cruzada ? <p className="mt-1 text-xs text-amber-700">Fora da sua RT (cruzada)</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
