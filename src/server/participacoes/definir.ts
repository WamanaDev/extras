/**
 * `API-ADM-PAR-001` — `PUT /api/admin/ciclos/:id/participacoes/:colaboradorId`.
 *
 * Lógica de negócio pura (sem `@prisma/client` direto — ver doc-comment de
 * `./tipos.ts`), consumida pelo adaptador de rota em
 * `src/app/api/admin/ciclos/[id]/participacoes/[colaboradorId]/route.ts`.
 *
 * Fluxo (`specs/04-api/admin-participacoes/API-ADM-PAR-001-definir.md`):
 * 1. Advisory lock do colaborador (via `PortaParticipacoes.travarColaborador`).
 * 2. Reduzir o limite abaixo do já usado, ou bloquear com extras marcadas →
 *    impacto + `confirmarImpacto`.
 * 3. `upsert` na `participacao_ciclo`.
 * 4. Auditar `LIMITE_ALTERADO` / `CRUZADA_ALTERADA` com antes → depois.
 * 5. Broadcast `ciclo:atualizado` — ver nota no adaptador de rota; infra de
 *    `RT-001` (`src/server/realtime/broadcast.ts`) ainda não existe neste
 *    repositório (entregável de outro agente, `05-realtime`, em paralelo).
 */
import { erroDeNegocio, erroNaoEncontrado, ErroHttp } from '@/server/http/erros';
import type { PortaParticipacoes } from './tipos';

const MOTIVO_MAX = 200;

export interface CorpoDefinirParticipacao {
  limiteOverride?: number | null | undefined;
  permiteCruzada?: boolean | null | undefined;
  bloqueado?: boolean | undefined;
  motivo?: string | undefined;
  confirmarImpacto?: boolean | undefined;
}

export interface EntradaDefinirParticipacao {
  cicloId: string;
  colaboradorId: string;
  atorTipo: 'ADMIN';
  atorId: string;
  ip: string;
  userAgent: string;
  requestId: string;
  body: CorpoDefinirParticipacao;
}

export interface SaidaDefinirParticipacao {
  cicloId: string;
  colaboradorId: string;
  limiteOverride: number | null;
  permiteCruzada: boolean | null;
  bloqueado: boolean;
  motivo: string | null;
}

/** `null` = herda do ciclo (RN-21) — distinto de `0`/`false` (CIA "I" da spec). */
function limiteEfetivo(participacao: { limiteOverride: number | null } | null, limitePadrao: number): number {
  if (participacao === null || participacao.limiteOverride === null) return limitePadrao;
  return participacao.limiteOverride;
}

export async function definirParticipacao(
  porta: PortaParticipacoes,
  entrada: EntradaDefinirParticipacao,
): Promise<SaidaDefinirParticipacao> {
  const { cicloId, colaboradorId, body } = entrada;

  // --- 1. advisory lock do colaborador ------------------------------------
  await porta.travarColaborador(colaboradorId);

  const ciclo = await porta.buscarCiclo(cicloId);
  if (!ciclo) throw erroNaoEncontrado();

  const colaborador = await porta.buscarColaborador(colaboradorId);
  if (!colaborador) throw erroNaoEncontrado();

  if (ciclo.status === 'FECHADO') {
    throw erroDeNegocio('Este ciclo está fechado e não aceita mais alterações.', 'CICLO_FECHADO');
  }

  const participacaoAtual = await porta.buscarParticipacao(cicloId, colaboradorId);
  const limiteAntes = limiteEfetivo(participacaoAtual, ciclo.limitePadrao);
  const usadas = await porta.contarUsadas(cicloId, colaboradorId);

  const reduzindoLimite = body.limiteOverride !== undefined && body.limiteOverride !== null && body.limiteOverride < limiteAntes;
  const bloqueando = body.bloqueado === true;

  // --- 2. impacto + confirmação --------------------------------------------
  const novoLimiteSeAplicado = body.limiteOverride !== undefined ? (body.limiteOverride ?? ciclo.limitePadrao) : limiteAntes;
  const reduzAbaixoDoUsado = body.limiteOverride !== undefined && usadas > novoLimiteSeAplicado;
  const bloqueiaComExtras = bloqueando && usadas > 0;

  if ((reduzAbaixoDoUsado || bloqueiaComExtras) && body.confirmarImpacto !== true) {
    throw erroDeNegocio(
      `Esta alteração afeta ${usadas} extra(s) já marcada(s) por ${colaborador.nome}. Confirme o impacto para prosseguir.`,
      'IMPACTO_NAO_CONFIRMADO',
    );
  }

  // --- motivo obrigatório em bloqueio e em redução de limite (CIA "R") ----
  if ((bloqueando || reduzindoLimite) && !temMotivo(body.motivo)) {
    throw new ErroHttp({
      status: 422,
      codigo: 'MOTIVO_OBRIGATORIO',
      mensagem: 'Informe o motivo para bloquear ou reduzir o limite deste colaborador.',
      detalhes: { motivo: 'obrigatório em bloqueio ou redução de limite' },
    });
  }
  if (body.motivo !== undefined && body.motivo.length > MOTIVO_MAX) {
    throw new ErroHttp({
      status: 422,
      codigo: 'VALIDACAO',
      mensagem: 'Motivo excede o tamanho máximo.',
      detalhes: { motivo: `máximo de ${MOTIVO_MAX} caracteres` },
    });
  }

  // --- 3. upsert -------------------------------------------------------------
  const depois: SaidaDefinirParticipacao = {
    cicloId,
    colaboradorId,
    limiteOverride: body.limiteOverride !== undefined ? body.limiteOverride : (participacaoAtual?.limiteOverride ?? null),
    permiteCruzada: body.permiteCruzada !== undefined ? body.permiteCruzada : (participacaoAtual?.permiteCruzada ?? null),
    bloqueado: body.bloqueado !== undefined ? body.bloqueado : (participacaoAtual?.bloqueado ?? false),
    motivo: body.motivo !== undefined ? body.motivo : (participacaoAtual?.motivo ?? null),
  };

  await porta.salvarParticipacao(cicloId, colaboradorId, {
    limiteOverride: depois.limiteOverride,
    permiteCruzada: depois.permiteCruzada,
    bloqueado: depois.bloqueado,
    motivo: depois.motivo,
  });

  // --- 4. auditoria (antes → depois) ------------------------------------------
  const antes = {
    limiteOverride: participacaoAtual?.limiteOverride ?? null,
    permiteCruzada: participacaoAtual?.permiteCruzada ?? null,
    bloqueado: participacaoAtual?.bloqueado ?? false,
    motivo: participacaoAtual?.motivo ?? null,
  };

  const limiteMudou = antes.limiteOverride !== depois.limiteOverride;
  const cruzadaMudou = antes.permiteCruzada !== depois.permiteCruzada;
  const bloqueioMudou = antes.bloqueado !== depois.bloqueado;

  if (limiteMudou || bloqueioMudou) {
    await porta.registrarAuditoria({
      atorTipo: entrada.atorTipo,
      atorId: entrada.atorId,
      acao: 'LIMITE_ALTERADO',
      entidade: 'participacao_ciclo',
      entidadeId: colaboradorId,
      payload: { cicloId, colaboradorId, antes, depois },
      ip: entrada.ip,
      userAgent: entrada.userAgent,
      requestId: entrada.requestId,
    });
  }
  if (cruzadaMudou) {
    await porta.registrarAuditoria({
      atorTipo: entrada.atorTipo,
      atorId: entrada.atorId,
      acao: 'CRUZADA_ALTERADA',
      entidade: 'participacao_ciclo',
      entidadeId: colaboradorId,
      payload: { cicloId, colaboradorId, antes, depois },
      ip: entrada.ip,
      userAgent: entrada.userAgent,
      requestId: entrada.requestId,
    });
  }

  return depois;
}

function temMotivo(motivo: string | undefined): boolean {
  return typeof motivo === 'string' && motivo.trim().length > 0;
}
