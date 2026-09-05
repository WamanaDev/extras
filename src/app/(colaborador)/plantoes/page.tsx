/**
 * `/(colaborador)/plantoes` — grade de extras, realtime (API-COL-003/004).
 *
 * Server Component busca o ciclo atual e a primeira carga da grade (evita
 * tela branca — FE-001.2); `<PlantoesClient />` assume a partir daí, com
 * Realtime via `usePlantoesRealtime`.
 */
import { getServidor } from '@/lib/api/servidor';
import type { GradePlantoesDados } from '@/components/plantoes/GradePlantoes';
import type { SaldoExtrasDados } from '@/components/extras/SaldoExtras';
import { PlantoesClient } from './_PlantoesClient';

interface CicloAtual {
  id: string;
  ano: number;
  mes: number;
  janela: { abertura: string; fechamento: string; estado: 'ANTES' | 'ABERTA' | 'ENCERRADA' };
  permiteCruzada: boolean;
  servidorEm: string;
}

const ESTADO_JANELA_TEXTO: Record<CicloAtual['janela']['estado'], string> = {
  ANTES: 'A janela de marcação ainda não abriu para este ciclo.',
  ABERTA: 'A janela de marcação está aberta.',
  ENCERRADA: 'A janela de marcação deste ciclo já encerrou.',
};

export default async function PlantoesPage(): Promise<JSX.Element> {
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

  const [dadosResultado, saldoResultado] = await Promise.all([
    getServidor<GradePlantoesDados>(`/api/plantoes?cicloId=${encodeURIComponent(ciclo.id)}`),
    getServidor<SaldoExtrasDados>(`/api/meu-saldo?cicloId=${encodeURIComponent(ciclo.id)}`),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-lg font-semibold text-slate-900">Plantões extras disponíveis</h1>
        <p className="mt-1 text-sm text-slate-600">{ESTADO_JANELA_TEXTO[ciclo.janela.estado]}</p>
      </section>

      <PlantoesClient
        cicloId={ciclo.id}
        {...(dadosResultado.ok ? { dadosIniciais: dadosResultado.dados } : {})}
        {...(saldoResultado.ok ? { saldoInicial: saldoResultado.dados } : {})}
      />
    </div>
  );
}
