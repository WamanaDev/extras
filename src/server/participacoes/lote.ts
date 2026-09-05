/**
 * `API-ADM-PAR-002` — `POST /api/admin/ciclos/:id/participacoes/lote`.
 *
 * Lógica de negócio pura, mesmo padrão de `./definir.ts` (porta
 * `PortaParticipacoes`, sem `@prisma/client` direto).
 *
 * Fluxo (`specs/04-api/admin-participacoes/API-ADM-PAR-002-lote.md`):
 * 1. Resolver o filtro (RT, turno ou lista explícita de colaboradores).
 * 2. `preview` → devolver sem gravar.
 * 3. Impacto agregado; sem confirmação → `409 IMPACTO_NAO_CONFIRMADO`.
 * 4. Advisory locks em ordem crescente de id (`PortaParticipacoes.travarColaboradores`
 *    já ordena — mesma disciplina de `API-ADM-PLA-003`).
 * 5. `upsert` em massa e **uma única** entrada de auditoria com filtro e
 *    contagem, mais uma linha por colaborador afetado no payload.
 */
import { erroDeNegocio, ErroHttp } from '@/server/http/erros';
import type { FiltroLote, PortaParticipacoes } from './tipos';

/** Teto de colaboradores por chamada (ACID "D" da spec). */
export const TETO_LOTE = 200;

export interface CorpoLoteParticipacao {
  filtro: FiltroLote;
  limiteOverride?: number | null | undefined;
  permiteCruzada?: boolean | null | undefined;
  motivo: string;
  preview?: boolean | undefined;
  confirmarImpacto?: boolean | undefined;
}

export interface EntradaLoteParticipacao {
  cicloId: string;
  atorTipo: 'ADMIN';
  atorId: string;
  ip: string;
  userAgent: string;
  requestId: string;
  body: CorpoLoteParticipacao;
}

export interface ImpactoColaborador {
  colaboradorId: string;
  nome: string;
  usadas: number;
  novoLimite: number;
}

export interface SaidaLoteParticipacao {
  afetados: number;
  impacto: ImpactoColaborador[];
}

export async function aplicarParticipacaoEmLote(
  porta: PortaParticipacoes,
  entrada: EntradaLoteParticipacao,
): Promise<SaidaLoteParticipacao> {
  const { cicloId, body } = entrada;

  // --- 1. resolver o filtro ---------------------------------------------------
  const colaboradores = await porta.buscarColaboradoresPorFiltro(body.filtro);

  if (colaboradores.length > TETO_LOTE) {
    throw new ErroHttp({
      status: 422,
      codigo: 'LOTE_MUITO_GRANDE',
      mensagem: `O filtro selecionou ${colaboradores.length} colaboradores — o teto por chamada é ${TETO_LOTE}.`,
      detalhes: { filtro: `máximo de ${TETO_LOTE} colaboradores por chamada` },
    });
  }

  const ciclo = await porta.buscarCiclo(cicloId);
  const limitePadrao = ciclo?.limitePadrao ?? 0;

  // --- impacto agregado --------------------------------------------------------
  const impacto: ImpactoColaborador[] = [];
  for (const colaborador of colaboradores) {
    const usadas = await porta.contarUsadas(cicloId, colaborador.id);
    const participacaoAtual = await porta.buscarParticipacao(cicloId, colaborador.id);
    const limiteAntes = participacaoAtual?.limiteOverride ?? limitePadrao;
    const novoLimite = body.limiteOverride !== undefined ? (body.limiteOverride ?? limitePadrao) : limiteAntes;
    impacto.push({ colaboradorId: colaborador.id, nome: colaborador.nome, usadas, novoLimite });
  }

  const afetadosAcimaDoNovoLimite = impacto.filter((linha) => linha.usadas > linha.novoLimite);

  // --- 2. preview → devolve sem gravar ------------------------------------------
  if (body.preview === true) {
    return { afetados: colaboradores.length, impacto };
  }

  // --- 3. impacto sem confirmação → 409 -----------------------------------------
  if (afetadosAcimaDoNovoLimite.length > 0 && body.confirmarImpacto !== true) {
    throw erroDeNegocio(
      `${afetadosAcimaDoNovoLimite.length} colaborador(es) ficariam com mais extras marcadas do que o novo limite. Confirme o impacto para prosseguir.`,
      'IMPACTO_NAO_CONFIRMADO',
    );
  }

  // --- 4. advisory locks em ordem crescente de id --------------------------------
  await porta.travarColaboradores(colaboradores.map((c) => c.id));

  // --- 5. upsert em massa ---------------------------------------------------------
  for (const colaborador of colaboradores) {
    await porta.salvarParticipacao(cicloId, colaborador.id, {
      ...(body.limiteOverride !== undefined ? { limiteOverride: body.limiteOverride } : {}),
      ...(body.permiteCruzada !== undefined ? { permiteCruzada: body.permiteCruzada } : {}),
      motivo: body.motivo,
    });
  }

  // --- auditoria única, com filtro + contagem, e uma linha por afetado -----------
  await porta.registrarAuditoria({
    atorTipo: entrada.atorTipo,
    atorId: entrada.atorId,
    acao: 'LIMITE_ALTERADO',
    entidade: 'participacao_ciclo',
    entidadeId: cicloId,
    payload: {
      cicloId,
      filtro: body.filtro,
      motivo: body.motivo,
      limiteOverride: body.limiteOverride,
      permiteCruzada: body.permiteCruzada,
      contagem: colaboradores.length,
      afetados: colaboradores.map((c) => c.id),
    },
    ip: entrada.ip,
    userAgent: entrada.userAgent,
    requestId: entrada.requestId,
  });

  return { afetados: colaboradores.length, impacto };
}
