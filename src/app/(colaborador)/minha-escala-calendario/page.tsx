/**
 * `/(colaborador)/minha-escala-calendario` — visão exploratória em calendário
 * dos mesmos dias de `/minha-escala` (API-COL-002), no mesmo espírito de
 * `/plantoes-calendario` ao lado de `/plantoes`: rota nova e independente,
 * que não toca em `minha-escala/page.tsx` para não arriscar a tela original.
 *
 * Mesma API (`GET /api/ciclos/atual`, `GET /api/minha-escala`,
 * `GET /api/minhas-marcacoes`) e os mesmos campos que `minha-escala/page.tsx`
 * já expõe (`codigo`, `descricaoCodigo`, `presenca`, `horaInicio`, `horaFim`,
 * `extra`) — nenhuma regra de negócio nova aqui, só uma apresentação
 * diferente dos dados que a API já decide. `escala_dia.observacao` (motivo
 * de ausência) nunca é exposto pela API, e esta página também não tenta
 * adivinhar isso.
 */
import { getServidor } from '@/lib/api/servidor';
import { CalendarioEscalaClient, type MinhaEscala, type MinhasMarcacoesResposta } from './_CalendarioEscalaClient';

interface CicloAtual {
  id: string;
  ano: number;
  mes: number;
  janela: { abertura: string; fechamento: string; estado: 'ANTES' | 'ABERTA' | 'ENCERRADA' };
  permiteCruzada: boolean;
  servidorEm: string;
}

export default async function MinhaEscalaCalendarioPage(): Promise<JSX.Element> {
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

  const [escalaResultado, marcacoesResultado] = await Promise.all([
    getServidor<MinhaEscala>(`/api/minha-escala?cicloId=${encodeURIComponent(ciclo.id)}`),
    getServidor<MinhasMarcacoesResposta>(`/api/minhas-marcacoes?cicloId=${encodeURIComponent(ciclo.id)}`),
  ]);

  if (!escalaResultado.ok) {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
        {escalaResultado.erro.mensagem}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-lg font-semibold text-slate-900">
          Minha escala — {String(ciclo.mes).padStart(2, '0')}/{ciclo.ano}
        </h1>
      </section>

      <CalendarioEscalaClient
        ano={ciclo.ano}
        mes={ciclo.mes}
        escala={escalaResultado.dados}
        {...(marcacoesResultado.ok ? { marcacoes: marcacoesResultado.dados } : {})}
      />
    </div>
  );
}
