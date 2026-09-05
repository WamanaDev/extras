/**
 * API-COL-004 — `POST /api/marcacoes`. Rota de maior contenção e maior risco
 * do sistema ("alteração exige revisão humana").
 *
 * Isolado de `route.ts` no mesmo padrão de `@/server/services/marcacoes-admin`
 * (API-ADM-MAR-002) — testável com um `PrismaClient` fake, nenhum teste toca
 * banco de verdade.
 *
 * Reaproveita, sem duplicar:
 * - `marcar_extra` (FN-005, `prisma/migrations/20260101000007_funcoes/migration.sql`)
 *   via `$queryRaw` dentro de `emTransacao` (`SEC-ACID`) — nenhuma regra de
 *   negócio (janela, jornada, limite, vaga, cruzada) é reimplementada aqui;
 *   advisory lock + `FOR UPDATE` inteiros dentro da função, nenhum lock
 *   próprio na camada de aplicação (spec, "ACID" — I).
 * - `saldo_colaborador` (FN-008) para o saldo devolvido no corpo (201).
 * - `registrarAuditoria` (`SEC-AUD`) **dentro** da mesma transação (AUD-2) —
 *   se a auditoria falhar, `emTransacao` faz rollback da marcação junto
 *   (spec, teste 7: "Falha na auditoria | marcação revertida").
 * - `traduzirErroNegocioExtra` (`./erros-negocio-extra.ts`) para os erros que
 *   `marcar_extra` levanta via `RAISE EXCEPTION` puro (sem SQLSTATE próprio) —
 *   capturado aqui, fora da transação (não faz sentido traduzir dentro dela),
 *   e relançado como `ErroHttp` já pronto para o pipeline de `defineHandler`
 *   repassar sem alteração. Erro não reconhecido (ex. violação de constraint
 *   real, `SEM_VAGA` por `chk_vagas`) sobe intacto para o caminho já existente
 *   (`erroApiParaPostgres`, `src/server/http/erros.ts`).
 *
 * `colaboradorId` **nunca** é lido do corpo da requisição — só o `ator` da
 * sessão, resolvido em `route.ts` (`SEC-INT`, T2; `contrato-comum.md`,
 * "Ator"). Este módulo recebe `colaboradorId` já resolvido, não decide de
 * onde ele vem.
 *
 * Broadcast (`marcacao:criada`) e idempotência (Redis) são responsabilidade
 * de `route.ts` — "depois do commit" (spec, Fluxo passo 5) só faz sentido
 * fora desta função, que só devolve depois que a transação já comitou.
 */
import type { PrismaClient } from '@prisma/client';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { erroInterno } from '@/server/http/erros';
import { traduzirErroNegocioExtra } from './erros-negocio-extra';

/** Só os métodos usados aqui — permite injetar um Prisma fake em teste. */
export type ClienteMarcarExtra = Pick<PrismaClient, '$transaction'>;

export interface MarcarExtraParams {
  plantaoId: string;
  colaboradorId: string;
  ip: string;
  userAgent: string;
  requestId: string;
}

export interface RespostaMarcarExtra {
  id: string;
  plantaoId: string;
  data: string;
  tipo: 'DIURNO' | 'NOTURNO';
  rt: string;
  cruzada: boolean;
  saldo: { limite: number; usadas: number; restantes: number };
  /**
   * Não faz parte do contrato de resposta da spec (`{ id, plantaoId, data,
   * tipo, rt, cruzada, saldo }`) — usado só por `route.ts` para o broadcast
   * pós-commit (`marcacao:criada` no canal `ciclo:{cicloId}`), que precisa do
   * ciclo sem uma segunda query. `route.ts` remove este campo antes de
   * devolver o corpo ao cliente.
   */
  cicloId: string;
}

interface LinhaMarcarExtra {
  id: string;
  cruzada: boolean;
}

interface LinhaSaldo {
  limite: number;
  usadas: number;
  restantes: number;
}

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * Marca uma extra em nome do colaborador da sessão. Lança `ErroHttp` (409,
 * salvo `SISTEMA_OCUPADO` 503) para toda regra de negócio recusada por
 * `marcar_extra` — `route.ts` nunca precisa inspecionar o erro, só deixá-lo
 * subir para `defineHandler`.
 */
export async function marcarExtraColaborador(
  prisma: ClienteMarcarExtra,
  params: MarcarExtraParams,
): Promise<RespostaMarcarExtra> {
  try {
    return await emTransacao(prisma as PrismaClient, async (tx) => {
      // 1. marcar_extra (FN-005), origem COLABORADOR — janela de marcação
      // (RN-27) é aplicada dentro da função só para esta origem.
      const linhasMarcacao = await tx.$queryRaw<LinhaMarcarExtra[]>`
        SELECT id, cruzada FROM marcar_extra(
          ${params.plantaoId}::uuid, ${params.colaboradorId}::uuid,
          'COLABORADOR'::origem_marcacao, ${params.ip}, ${params.userAgent}
        )
      `;
      const marcacao = linhasMarcacao[0];
      if (!marcacao) throw erroInterno(new Error('marcar_extra não retornou linha'));

      const plantao = await tx.plantao.findUniqueOrThrow({
        where: { id: params.plantaoId },
        select: { id: true, data: true, tipo: true, cicloId: true, rt: { select: { nome: true } } },
      });

      const linhasSaldo = await tx.$queryRaw<LinhaSaldo[]>`
        SELECT limite, usadas, restantes FROM saldo_colaborador(${plantao.cicloId}::uuid, ${params.colaboradorId}::uuid)
      `;
      const saldo = linhasSaldo[0] ?? { limite: 0, usadas: 0, restantes: 0 };

      // 2. Auditoria dentro da mesma transação (AUD-2, ACID — A). Se isto
      // lançar, `emTransacao` reverte a marcação junto (spec, teste 7).
      await registrarAuditoria(tx, {
        atorTipo: 'COLABORADOR',
        atorId: params.colaboradorId,
        acao: 'EXTRA_MARCADA',
        entidade: 'marcacao',
        entidadeId: marcacao.id,
        payload: { origem: 'COLABORADOR', plantaoId: params.plantaoId },
        ip: params.ip,
        userAgent: params.userAgent,
        requestId: params.requestId,
      });

      return {
        id: marcacao.id,
        plantaoId: plantao.id,
        data: formatarData(plantao.data),
        tipo: plantao.tipo,
        rt: plantao.rt.nome,
        cruzada: marcacao.cruzada,
        saldo: { limite: saldo.limite, usadas: saldo.usadas, restantes: saldo.restantes },
        cicloId: plantao.cicloId,
      };
    });
  } catch (erro) {
    // Traduz `RAISE EXCEPTION 'CODIGO'` de marcar_extra (sem SQLSTATE
    // próprio) para `ErroHttp` — erro não reconhecido sobe intacto para o
    // pipeline padrão (`erroApiParaPostgres`/`500`, `src/server/http/erros.ts`).
    const traduzido = traduzirErroNegocioExtra(erro);
    if (traduzido) throw traduzido;
    throw erro;
  }
}
