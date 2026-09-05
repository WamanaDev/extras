/**
 * API-COL-005 — `DELETE /api/marcacoes/:id`.
 *
 * Mesmo padrão de `./marcar-extra.ts` (API-COL-004) e de
 * `@/server/services/marcacoes-admin` (API-ADM-MAR-003) — testável com um
 * Prisma fake.
 *
 * Reaproveita:
 * - `cancelar_extra` (FN-006) via `$queryRaw` dentro de `emTransacao`. A
 *   própria função já resolve "própria marcação → 404 se de terceiro"
 *   (`p_ator_tipo = 'COLABORADOR' AND v_marc.colaborador_id <> p_ator_id` →
 *   `RAISE EXCEPTION 'MARCACAO_INEXISTENTE'`, ver migration) — este módulo
 *   não faz checagem de propriedade em separado, evitando uma segunda fonte
 *   de verdade que poderia divergir da função (`SEC-CONF`: 404 uniforme para
 *   inexistente e de terceiro).
 * - `saldo_colaborador` (FN-008) para o saldo devolvido no corpo (200).
 * - `registrarAuditoria` (AUD-2) dentro da mesma transação.
 * - `traduzirErroNegocioExtra` para `MARCACAO_INEXISTENTE` (404) /
 *   `JANELA_ENCERRADA`/`CICLO_FECHADO` (409).
 *
 * Idempotente por construção: `cancelar_extra` retorna a linha já
 * `CANCELADA` sem decrementar de novo quando chamada duas vezes na mesma
 * marcação (FN-006) — este módulo grava auditoria mesmo na segunda chamada
 * (evento de tentativa, não de mutação de estado; mesma decisão de
 * `cancelarExtraAdmin`).
 */
import type { PrismaClient } from '@prisma/client';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { erroInterno } from '@/server/http/erros';
import { traduzirErroNegocioExtra } from './erros-negocio-extra';

export type ClienteCancelarExtra = Pick<PrismaClient, '$transaction'>;

export interface CancelarExtraParams {
  marcacaoId: string;
  colaboradorId: string;
  ip: string;
  userAgent: string;
  requestId: string;
}

export interface RespostaCancelarExtra {
  id: string;
  status: 'CANCELADA';
  plantaoId: string;
  saldo: { limite: number; usadas: number; restantes: number };
  /** Não faz parte do contrato de resposta — usado por `route.ts` para o broadcast pós-commit. Removido antes de devolver o corpo ao cliente. */
  cicloId: string;
}

interface LinhaCancelarExtra {
  id: string;
  status: string;
  plantaoId: string;
  colaboradorId: string;
}

interface LinhaSaldo {
  limite: number;
  usadas: number;
  restantes: number;
}

export async function cancelarExtraColaborador(
  prisma: ClienteCancelarExtra,
  params: CancelarExtraParams,
): Promise<RespostaCancelarExtra> {
  try {
    return await emTransacao(prisma as PrismaClient, async (tx) => {
      const linhas = await tx.$queryRaw<LinhaCancelarExtra[]>`
        SELECT id, status, plantao_id AS "plantaoId", colaborador_id AS "colaboradorId"
          FROM cancelar_extra(${params.marcacaoId}::uuid, ${params.colaboradorId}::uuid, 'COLABORADOR')
      `;
      const marcacao = linhas[0];
      if (!marcacao) throw erroInterno(new Error('cancelar_extra não retornou linha'));

      const plantao = await tx.plantao.findUniqueOrThrow({
        where: { id: marcacao.plantaoId },
        select: { cicloId: true },
      });
      const linhasSaldo = await tx.$queryRaw<LinhaSaldo[]>`
        SELECT limite, usadas, restantes FROM saldo_colaborador(${plantao.cicloId}::uuid, ${params.colaboradorId}::uuid)
      `;
      const saldo = linhasSaldo[0] ?? { limite: 0, usadas: 0, restantes: 0 };

      // Auditoria dentro da mesma transação (AUD-2) — gravada mesmo em
      // chamada idempotente (segunda vez): é um novo evento de tentativa, não
      // uma segunda mutação de estado (mesma decisão de cancelarExtraAdmin).
      await registrarAuditoria(tx, {
        atorTipo: 'COLABORADOR',
        atorId: params.colaboradorId,
        acao: 'EXTRA_CANCELADA',
        entidade: 'marcacao',
        entidadeId: marcacao.id,
        payload: { origem: 'COLABORADOR' },
        ip: params.ip,
        userAgent: params.userAgent,
        requestId: params.requestId,
      });

      return {
        id: marcacao.id,
        status: 'CANCELADA',
        plantaoId: marcacao.plantaoId,
        saldo: { limite: saldo.limite, usadas: saldo.usadas, restantes: saldo.restantes },
        cicloId: plantao.cicloId,
      };
    });
  } catch (erro) {
    const traduzido = traduzirErroNegocioExtra(erro);
    if (traduzido) throw traduzido;
    throw erro;
  }
}
