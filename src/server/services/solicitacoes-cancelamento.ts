/**
 * Fluxo de aprovação de cancelamento de extra — pedido do usuário, sem spec
 * de API própria ainda (ver `_conflitos.md`): colaborador não cancela mais a
 * própria marcação direto (`@/server/services/colaborador/solicitar-cancelamento`
 * só abre um pedido `PENDENTE`); QUALQUER admin (não um específico) aprova ou
 * recusa aqui.
 *
 * Aprovar reaproveita `cancelar_extra` (FN-006) com origem ADMIN — mesma
 * função e mesmo `$queryRaw` que `marcacoes-admin.ts` já usa em
 * `cancelarExtraAdmin` — nenhuma lógica de cancelamento nova, só uma origem
 * diferente (aprovação de pedido em vez de cancelamento direto do admin).
 * Recusar nunca toca a marcação, só marca o pedido como resolvido.
 */
import type { PrismaClient } from '@prisma/client';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { erroInterno, erroNaoEncontrado, erroDeNegocio } from '@/server/http/erros';
import { criarNotificacao, type ClienteNotificacao } from '@/server/notificacoes/criar';
import { redigirParaLog } from '@/server/log/redact';

/**
 * Inclui `ClienteNotificacao` (não só `$transaction`/`solicitacaoCancelamento`)
 * porque `aprovarSolicitacaoCancelamento`/`recusarSolicitacaoCancelamento`
 * chamam `criarNotificacao` com este MESMO client depois do commit (mesmo
 * padrão de `publicarCiclo`, que recebe o `PrismaClient` completo pelo mesmo
 * motivo) — sem isso seria preciso um cast pra satisfazer as duas formas.
 */
export type ClienteSolicitacoesBanco = Pick<PrismaClient, '$transaction' | 'solicitacaoCancelamento'> & ClienteNotificacao;

// ----------------------------------------------------------------------------
// Listar
// ----------------------------------------------------------------------------

export interface FiltrosListarSolicitacoes {
  status?: 'PENDENTE' | 'APROVADA' | 'RECUSADA' | undefined;
  pagina: number;
  tamanho: number;
}

export interface SolicitacaoListada {
  id: string;
  colaborador: { id: string; nome: string; matricula: string };
  marcacao: { id: string; data: string; tipo: string; rt: string; horaInicio: string; horaFim: string };
  motivo: string;
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA';
  motivoResolucao: string | null;
  criadoEm: string;
  resolvidoEm: string | null;
}

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function formatarHora(hora: Date): string {
  return hora.toISOString().slice(11, 19);
}

export async function listarSolicitacoesCancelamento(
  prisma: ClienteSolicitacoesBanco,
  filtros: FiltrosListarSolicitacoes,
): Promise<{ itens: SolicitacaoListada[]; total: number }> {
  const where = filtros.status !== undefined ? { status: filtros.status } : {};

  const [linhas, total] = await Promise.all([
    prisma.solicitacaoCancelamento.findMany({
      where,
      // Pendente primeiro é o padrão útil pro admin (fila de trabalho); dentro
      // do mesmo status, mais antiga primeiro (FIFO — quem pediu há mais tempo espera menos).
      orderBy: [{ status: 'asc' }, { criadoEm: 'asc' }],
      skip: (filtros.pagina - 1) * filtros.tamanho,
      take: filtros.tamanho,
      select: {
        id: true,
        motivo: true,
        status: true,
        motivoResolucao: true,
        criadoEm: true,
        resolvidoEm: true,
        colaborador: { select: { id: true, nome: true, matricula: true } },
        marcacao: {
          select: {
            id: true,
            plantao: { select: { data: true, tipo: true, horaInicio: true, horaFim: true, rt: { select: { nome: true } } } },
          },
        },
      },
    }),
    prisma.solicitacaoCancelamento.count({ where }),
  ]);

  return {
    itens: linhas.map((linha) => ({
      id: linha.id,
      colaborador: linha.colaborador,
      marcacao: {
        id: linha.marcacao.id,
        data: formatarData(linha.marcacao.plantao.data),
        tipo: linha.marcacao.plantao.tipo,
        rt: linha.marcacao.plantao.rt.nome,
        horaInicio: formatarHora(linha.marcacao.plantao.horaInicio),
        horaFim: formatarHora(linha.marcacao.plantao.horaFim),
      },
      motivo: linha.motivo,
      status: linha.status,
      motivoResolucao: linha.motivoResolucao,
      criadoEm: linha.criadoEm.toISOString(),
      resolvidoEm: linha.resolvidoEm ? linha.resolvidoEm.toISOString() : null,
    })),
    total,
  };
}

// ----------------------------------------------------------------------------
// Aprovar / recusar
// ----------------------------------------------------------------------------

export interface ResolverSolicitacaoParams {
  solicitacaoId: string;
  adminId: string;
  ip: string;
  userAgent: string;
  requestId: string;
}

export interface AprovarSolicitacaoParams extends ResolverSolicitacaoParams {
  motivoResolucao?: string | undefined;
}

export interface RecusarSolicitacaoParams extends ResolverSolicitacaoParams {
  // Obrigatório — é o que explica pro colaborador por que o pedido não foi aceito.
  motivoResolucao: string;
}

export interface RespostaResolverSolicitacao {
  id: string;
  status: 'APROVADA' | 'RECUSADA';
  marcacaoId: string;
  colaboradorId: string;
}

interface LinhaCancelarExtra {
  id: string;
  status: string;
  plantaoId: string;
}

async function buscarESolicitacaoPendente(
  tx: Pick<PrismaClient, 'solicitacaoCancelamento'>,
  solicitacaoId: string,
): Promise<{ id: string; marcacaoId: string; colaboradorId: string }> {
  const solicitacao = await tx.solicitacaoCancelamento.findUnique({
    where: { id: solicitacaoId },
    select: { id: true, marcacaoId: true, colaboradorId: true, status: true },
  });
  if (!solicitacao) throw erroNaoEncontrado('Solicitação de cancelamento não encontrada.');
  if (solicitacao.status !== 'PENDENTE') {
    throw erroDeNegocio('Esta solicitação já foi resolvida por outro admin.');
  }
  return solicitacao;
}

export async function aprovarSolicitacaoCancelamento(
  prisma: ClienteSolicitacoesBanco,
  params: AprovarSolicitacaoParams,
): Promise<RespostaResolverSolicitacao> {
  const resultado = await emTransacao(prisma as PrismaClient, async (tx) => {
    const solicitacao = await buscarESolicitacaoPendente(tx, params.solicitacaoId);

    // cancelar_extra (FN-006), origem ADMIN — mesma função/mesmo `$queryRaw`
    // de `cancelarExtraAdmin` (marcacoes-admin.ts). "Qualquer admin" (pedido
    // do usuário): nenhuma checagem de qual admin é o dono do pedido.
    const linhas = await tx.$queryRaw<LinhaCancelarExtra[]>`
      SELECT id, status, plantao_id AS "plantaoId"
        FROM cancelar_extra(${solicitacao.marcacaoId}::uuid, ${params.adminId}::uuid, 'ADMIN')
    `;
    if (!linhas[0]) throw erroInterno(new Error('cancelar_extra não retornou linha'));

    const atualizada = await tx.solicitacaoCancelamento.update({
      where: { id: solicitacao.id },
      data: {
        status: 'APROVADA',
        resolvidoPorId: params.adminId,
        resolvidoEm: new Date(),
        motivoResolucao: params.motivoResolucao ?? null,
      },
    });

    await registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: params.adminId,
      acao: 'CANCELAMENTO_APROVADO',
      entidade: 'solicitacao_cancelamento',
      entidadeId: atualizada.id,
      payload: { marcacaoId: solicitacao.marcacaoId, motivoResolucao: params.motivoResolucao ?? null },
      ip: params.ip,
      userAgent: params.userAgent,
      requestId: params.requestId,
    });

    return { id: atualizada.id, status: 'APROVADA' as const, marcacaoId: solicitacao.marcacaoId, colaboradorId: solicitacao.colaboradorId };
  });

  // Depois do commit, nunca antes (SEC-ACID) — mesmo padrão de
  // `publicarCiclo` (item 51, `_conflitos.md`): falha ao notificar nunca
  // desfaz nem reporta erro de uma aprovação que já aconteceu de verdade.
  try {
    await criarNotificacao(prisma, {
      colaboradorId: resultado.colaboradorId,
      tipo: 'CANCELAMENTO_APROVADO',
      titulo: 'Cancelamento aprovado',
      mensagem: 'Seu pedido de cancelamento de extra foi aprovado.',
      link: '/minhas-extras',
    });
  } catch (erro) {
    // eslint-disable-next-line no-console
    console.error(redigirParaLog({ msg: 'falha ao notificar aprovação de cancelamento', colaboradorId: resultado.colaboradorId, erro: String(erro) }));
  }

  return resultado;
}

export async function recusarSolicitacaoCancelamento(
  prisma: ClienteSolicitacoesBanco,
  params: RecusarSolicitacaoParams,
): Promise<RespostaResolverSolicitacao> {
  const resultado = await emTransacao(prisma as PrismaClient, async (tx) => {
    const solicitacao = await buscarESolicitacaoPendente(tx, params.solicitacaoId);

    const atualizada = await tx.solicitacaoCancelamento.update({
      where: { id: solicitacao.id },
      data: {
        status: 'RECUSADA',
        resolvidoPorId: params.adminId,
        resolvidoEm: new Date(),
        motivoResolucao: params.motivoResolucao,
      },
    });

    await registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: params.adminId,
      acao: 'CANCELAMENTO_RECUSADO',
      entidade: 'solicitacao_cancelamento',
      entidadeId: atualizada.id,
      payload: { marcacaoId: solicitacao.marcacaoId, motivoResolucao: params.motivoResolucao },
      ip: params.ip,
      userAgent: params.userAgent,
      requestId: params.requestId,
    });

    return { id: atualizada.id, status: 'RECUSADA' as const, marcacaoId: solicitacao.marcacaoId, colaboradorId: solicitacao.colaboradorId };
  });

  try {
    await criarNotificacao(prisma, {
      colaboradorId: resultado.colaboradorId,
      tipo: 'CANCELAMENTO_RECUSADO',
      titulo: 'Cancelamento recusado',
      mensagem: `Seu pedido de cancelamento de extra foi recusado. Motivo: ${params.motivoResolucao}`,
      link: '/minhas-extras',
    });
  } catch (erro) {
    // eslint-disable-next-line no-console
    console.error(redigirParaLog({ msg: 'falha ao notificar recusa de cancelamento', colaboradorId: resultado.colaboradorId, erro: String(erro) }));
  }

  return resultado;
}
