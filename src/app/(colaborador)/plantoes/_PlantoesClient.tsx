'use client';

/**
 * Cola client-side entre `<GradePlantoes />`/`<SaldoExtras />` (já prontos,
 * `src/components/*`) e `usePlantoesRealtime` (RT-001): qualquer evento do
 * canal `ciclo:{cicloId}` revalida a grade (força um novo `GET /api/plantoes`
 * — RT-001, "Regra de refetch": nunca recalcula localmente quem tem vaga) e
 * qualquer marcação/cancelamento feito por este próprio usuário revalida o
 * saldo.
 *
 * Revalidação via prop (`revalidarChave`), nunca via `key` em `<GradePlantoes
 * />` — trocar a `key` remonta o componente do zero (perde `dados`, mostra
 * "Carregando…" de novo a cada marcação de QUALQUER colaborador em qualquer
 * máquina) — achado em uso real, quebrava a imersão. Ver `_conflitos.md`.
 */
import { useState } from 'react';
import { GradePlantoes, type GradePlantoesDados } from '@/components/plantoes/GradePlantoes';
import { SaldoExtras, type SaldoExtrasDados } from '@/components/extras/SaldoExtras';
import { usePlantoesRealtime } from '@/hooks/usePlantoesRealtime';

export function PlantoesClient({
  cicloId,
  dadosIniciais,
  saldoInicial,
}: {
  cicloId: string;
  dadosIniciais?: GradePlantoesDados;
  /**
   * Saldo completo (API-COL-007) para hidratar `<SaldoExtras />` sem um
   * segundo fetch na primeira carga — `GradePlantoesDados.saldo` (API-COL-003)
   * é um subconjunto (sem `bloqueado`/`motivoBloqueio`) e não serve aqui.
   */
  saldoInicial?: SaldoExtrasDados;
}): JSX.Element {
  const [gradeKey, setGradeKey] = useState(0);
  const [saldoRevalidar, setSaldoRevalidar] = useState(0);

  usePlantoesRealtime(cicloId, () => setGradeKey((atual) => atual + 1));

  // `SaldoExtras` aceita `saldo` controlado para não refazer um fetch que a
  // primeira carga (SSR) já trouxe; nas revalidações seguintes ele busca
  // sozinho via `revalidarChave` (mesmo contrato que o componente já expõe).
  const propsSaldoInicial = gradeKey === 0 && saldoRevalidar === 0 && saldoInicial ? { saldo: saldoInicial } : {};
  const propsGradeIniciais = dadosIniciais ? { dadosIniciais } : {};

  return (
    <div className="space-y-6">
      <SaldoExtras cicloId={cicloId} revalidarChave={saldoRevalidar + gradeKey} {...propsSaldoInicial} />
      <GradePlantoes
        cicloId={cicloId}
        revalidarChave={gradeKey}
        onMudouSaldo={() => setSaldoRevalidar((atual) => atual + 1)}
        {...propsGradeIniciais}
      />
    </div>
  );
}
