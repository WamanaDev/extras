/**
 * API-ADM-PLA-004 — núcleo transacional de `DELETE /api/admin/plantoes/:id`.
 *
 * Cancela cada marcação confirmada via `FN-006 cancelar_extra` (reaproveita
 * a fonte única de verdade do cancelamento — `03-banco/funcoes/fn-006-
 * cancelar-extra.md` — em vez de reimplementar `UPDATE status` +
 * decremento à mão). Assinatura real (`_conflitos.md`, item 8):
 * `cancelar_extra(p_marcacao_id uuid, p_ator_id uuid, p_ator_tipo text)`.
 *
 * Ordem de locks: mesmo padrão de `API-ADM-PLA-003` (`./locks.ts`) — o
 * `FOR UPDATE` do plantão já foi tomado antes de qualquer colaborador, então
 * os locks de colaborador usam `pg_try_advisory_xact_lock` com backoff, não
 * o `travarColaborador` bloqueante (que assume a ordem colaborador→plantão
 * de `FN-005`/`FN-006`).
 */
import type { ClienteTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import type { ContextoAuditoria } from './criar';
import { erroPlantao409, erroPlantao422 } from './erros';
import { erroNaoEncontrado } from '@/server/http/erros';
import { travarColaboradoresComBackoff } from './locks';

// `| undefined` explícito: mesmo motivo de `AtualizarPlantaoInput`
// (`./atualizar.ts`) — corpo vindo de `RemoverPlantaoSchema.parse()`
// (`[id]/route.ts`), `exactOptionalPropertyTypes` (`_conflitos.md`, item 13).
export interface RemoverPlantaoInput {
  confirmarCancelamentos?: boolean | undefined;
  motivo?: string | undefined;
}

export interface ResultadoRemocao {
  id: string;
  ativo: false;
  marcacoesCanceladas: number;
}

export async function removerPlantao(
  tx: ClienteTransacao,
  plantaoId: string,
  input: RemoverPlantaoInput,
  ctx: ContextoAuditoria,
): Promise<ResultadoRemocao> {
  // 1. `FOR UPDATE`.
  await tx.$executeRaw`SELECT id FROM plantao WHERE id = ${plantaoId}::uuid FOR UPDATE`;

  const antes = await tx.plantao.findUnique({ where: { id: plantaoId } });
  if (!antes) throw erroNaoEncontrado('Plantão não encontrado.');

  const ciclo = await tx.ciclo.findUnique({ where: { id: antes.cicloId } });
  if (!ciclo) throw erroNaoEncontrado('Plantão não encontrado.');
  if (ciclo.status === 'FECHADO') {
    throw erroPlantao409('Este ciclo está fechado.', 'CICLO_FECHADO');
  }

  const marcacoesConfirmadas = await tx.marcacao.findMany({
    where: { plantaoId, status: 'CONFIRMADA' },
    select: { id: true, colaboradorId: true },
  });

  if (marcacoesConfirmadas.length > 0) {
    // 2. Havendo marcações confirmadas e sem confirmação → 409 com a lista de afetados.
    if (input.confirmarCancelamentos !== true) {
      const detalhes = Object.fromEntries(marcacoesConfirmadas.map((m, i) => [`afetado_${i}`, m.colaboradorId]));
      throw erroPlantao409('Este plantão tem marcações confirmadas — confirme o cancelamento para prosseguir.', 'IMPACTO_NAO_CONFIRMADO', detalhes);
    }
    // `motivo` obrigatório quando há cancelamentos (CIA — R).
    if (!input.motivo || input.motivo.trim().length === 0) {
      throw erroPlantao422('Informe o motivo do cancelamento.', 'MOTIVO_OBRIGATORIO', { motivo: 'obrigatório quando há marcações a cancelar' });
    }

    const colaboradorIds = [...new Set(marcacoesConfirmadas.map((m) => m.colaboradorId))];
    await travarColaboradoresComBackoff(tx, colaboradorIds);

    // 3. Cancelar cada marcação via FN-006.
    for (const marcacao of marcacoesConfirmadas) {
      await tx.$executeRaw`SELECT cancelar_extra(${marcacao.id}::uuid, ${ctx.atorId}::uuid, 'ADMIN')`;
    }
  }

  const depois = await tx.plantao.update({ where: { id: plantaoId }, data: { ativo: false } });

  // 4. Auditar com o motivo e os afetados.
  await registrarAuditoria(tx, {
    atorTipo: 'ADMIN',
    atorId: ctx.atorId,
    acao: 'PLANTAO_REMOVIDO',
    entidade: 'plantao',
    entidadeId: plantaoId,
    payload: { antes, motivo: input.motivo ?? null, afetados: marcacoesConfirmadas.map((m) => m.colaboradorId) },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  // 5. Broadcast — ver `./criar.ts` (sem infraestrutura de Realtime entregue ainda).

  return { id: depois.id, ativo: false, marcacoesCanceladas: marcacoesConfirmadas.length };
}
