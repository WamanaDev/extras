/**
 * `/(colaborador)/minhas-extras` — histórico de extras do ciclo (API-COL-006),
 * com cancelamento (API-COL-005). Server Component busca o ciclo atual e a
 * primeira carga; `<MinhasExtrasClient />` cuida do cancelamento interativo.
 */
import { getServidor } from '@/lib/api/servidor';
import { MinhasExtrasClient, type MinhasMarcacoesDados } from './_MinhasExtrasClient';

interface CicloAtual {
  id: string;
  ano: number;
  mes: number;
  janela: { abertura: string; fechamento: string; estado: 'ANTES' | 'ABERTA' | 'ENCERRADA' };
  permiteCruzada: boolean;
  servidorEm: string;
}

export default async function MinhasExtrasPage(): Promise<JSX.Element> {
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

  const dadosResultado = await getServidor<MinhasMarcacoesDados>(
    `/api/minhas-marcacoes?cicloId=${encodeURIComponent(ciclo.id)}`,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Minhas extras</h1>

      <MinhasExtrasClient cicloId={ciclo.id} {...(dadosResultado.ok ? { dadosIniciais: dadosResultado.dados } : {})} />
    </div>
  );
}
