/**
 * `/(colaborador)/painel` — saldo de extras + próximos plantões (API-COL-001/007).
 *
 * Server Component: busca ciclo atual, saldo e escala em paralelo no
 * servidor (nunca tela branca — FE-001.2) e hidrata `<SaldoExtras />` com o
 * valor já carregado (a barra continua "viva" via Realtime só na página de
 * plantões, que é onde a spec pede realtime).
 */
import Link from 'next/link';
import { getServidor } from '@/lib/api/servidor';
import { SaldoExtras, type SaldoExtrasDados } from '@/components/extras/SaldoExtras';
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

const ESTADO_JANELA_TEXTO: Record<CicloAtual['janela']['estado'], string> = {
  ANTES: 'A janela de marcação de extras ainda não abriu.',
  ABERTA: 'A janela de marcação de extras está aberta.',
  ENCERRADA: 'A janela de marcação de extras deste ciclo já encerrou.',
};

export default async function PainelPage(): Promise<JSX.Element> {
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
        Nenhum ciclo publicado no momento. Volte mais tarde para ver sua escala e plantões extras.
      </div>
    );
  }

  const [saldoResultado, escalaResultado] = await Promise.all([
    getServidor<SaldoExtrasDados>(`/api/meu-saldo?cicloId=${encodeURIComponent(ciclo.id)}`),
    getServidor<MinhaEscala>(`/api/minha-escala?cicloId=${encodeURIComponent(ciclo.id)}`),
  ]);

  const hoje = ciclo.servidorEm.slice(0, 10);
  const proximos = escalaResultado.ok
    ? escalaResultado.dados.dias.filter((dia) => dia.data >= hoje && (dia.presenca || dia.extra)).slice(0, 5)
    : [];

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-lg font-semibold text-slate-900">
          Ciclo {String(ciclo.mes).padStart(2, '0')}/{ciclo.ano}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{ESTADO_JANELA_TEXTO[ciclo.janela.estado]}</p>
      </section>

      {saldoResultado.ok ? (
        <SaldoExtras cicloId={ciclo.id} saldo={saldoResultado.dados} />
      ) : (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
          {saldoResultado.erro.mensagem}
        </div>
      )}

      <section aria-labelledby="titulo-proximos" className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 id="titulo-proximos" className="text-sm font-semibold text-slate-900">
          Próximos plantões
        </h2>

        {!escalaResultado.ok ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {escalaResultado.erro.mensagem}
          </p>
        ) : proximos.length === 0 ? (
          <p role="status" className="mt-2 text-sm text-slate-600">
            Nenhum plantão previsto nos próximos dias.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {proximos.map((dia) => (
              <li key={dia.data} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-medium text-slate-900">{dia.data}</span>
                <span className="text-slate-600">
                  {dia.presenca ? `${dia.descricaoCodigo} · ${dia.horaInicio}–${dia.horaFim}` : dia.descricaoCodigo}
                </span>
                {dia.extra ? (
                  <Badge variant="warning">
                    Extra {dia.extra.rt} {dia.extra.horaInicio}–{dia.extra.horaFim}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/plantoes-calendario" className="font-medium text-slate-900 underline underline-offset-2">
          Ver plantões disponíveis para extra
        </Link>
        <Link href="/minha-escala-calendario" className="font-medium text-slate-900 underline underline-offset-2">
          Ver escala completa do ciclo
        </Link>
      </div>
    </div>
  );
}
