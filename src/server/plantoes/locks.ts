/**
 * Lock de colaborador com `pg_try_advisory_xact_lock` + backoff — só para
 * `API-ADM-PLA-003` e `API-ADM-PLA-004`.
 *
 * `SEC-ACID`/`03-banco/funcoes/fn-005-marcar-extra.md` fixam a ordem
 * "colaborador primeiro, plantão depois" com `pg_advisory_xact_lock`
 * (bloqueante) em todo o resto do sistema (`src/server/db/tx.ts`,
 * `travarColaborador`/`travarColaboradores`). `API-ADM-PLA-003` já parte de
 * um `SELECT ... FOR UPDATE` no *plantão* antes de tocar colaborador — ordem
 * invertida, documentada como o único ponto do sistema onde isso acontece
 * (spec, seção ACID). `API-ADM-PLA-004` cai na mesma situação (também
 * trava o plantão primeiro, e só depois — via `cancelar_extra`, `FN-006` —
 * chega ao colaborador), e a própria spec de `004` diz "mesmo padrão de
 * `API-ADM-PLA-003`" para os locks — por isso reaproveita este helper em
 * vez de duplicá-lo.
 *
 * Com a ordem invertida, um `marcar_extra`/`cancelar_extra` concorrente do
 * mesmo colaborador (que trava colaborador primeiro, plantão depois) pode
 * formar ciclo de espera com esta rota (que já segura o plantão e quer o
 * colaborador). `pg_advisory_xact_lock` bloqueante alimentaria esse ciclo
 * até o deadlock detector do Postgres (~1s) resolver derrubando alguém —
 * imprevisível. `pg_try_advisory_xact_lock` em laço com prazo curto (3s,
 * fixado pela spec) evita esperar o ciclo se formar: se o lock não vier a
 * tempo, a operação aborta com `SISTEMA_OCUPADO` em vez de arriscar.
 */
import { ErroHttp } from '@/server/http/erros';
import type { ClienteTransacao } from '@/server/db/tx';

/** `SISTEMA_OCUPADO` já é `ErroApi` (`db/erros.ts`) — mesmo código/status/Retry-After do lock timeout de SQLSTATE, construído aqui à mão porque a origem não é um SQLSTATE (é o laço de `pg_try_advisory_xact_lock` esgotando o prazo antes de chegar ao banco). */
function erroSistemaOcupado(): ErroHttp {
  return new ErroHttp({
    status: 503,
    codigo: 'SISTEMA_OCUPADO',
    mensagem: 'Sistema ocupado no momento. Tente novamente em instantes.',
    retryAfterSegundos: 1,
  });
}

const PRAZO_PADRAO_MS = 3_000;
const INTERVALO_TENTATIVA_MS = 50;

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Uma tentativa de `pg_try_advisory_xact_lock` para um colaborador — `true` se obteve o lock. */
export async function tentarTravarColaborador(tx: ClienteTransacao, colaboradorId: string): Promise<boolean> {
  const linhas = await tx.$queryRaw<Array<{ obtido: boolean }>>`
    SELECT pg_try_advisory_xact_lock(hashtextextended(${colaboradorId}::text, 0)) AS obtido
  `;
  return linhas[0]?.obtido === true;
}

/**
 * Trava, em ordem crescente de id, uma lista de colaboradores — cada um com
 * `pg_try_advisory_xact_lock` em laço até `prazoMs` (padrão 3s, spec
 * `API-ADM-PLA-003`). Lança `SISTEMA_OCUPADO` (503, `Retry-After: 1` — igual
 * ao mapeamento central de lock timeout em `db/erros.ts`) se algum lock não
 * vier a tempo, em vez de esperar indefinidamente.
 */
export async function travarColaboradoresComBackoff(
  tx: ClienteTransacao,
  colaboradorIds: readonly string[],
  prazoMs = PRAZO_PADRAO_MS,
): Promise<void> {
  const ordenados = [...colaboradorIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const id of ordenados) {
    const inicio = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (await tentarTravarColaborador(tx, id)) break;
      if (Date.now() - inicio >= prazoMs) {
        throw erroSistemaOcupado();
      }
      await aguardar(INTERVALO_TENTATIVA_MS);
    }
  }
}
