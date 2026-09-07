/**
 * API-AGE-* — Agendamentos (consulta/saída). FN-010 `criar_agendamento`,
 * FN-011 `cancelar_agendamento`, FN-013 `agenda_rt`.
 *
 * Cada operação transacional tem duas formas:
 * - `*Tx(tx, ...)` — núcleo, roda dentro de uma transação já aberta pelo
 *   chamador (ex.: `pacientes.ts` cancelando agendamentos futuros ao
 *   inativar um paciente). Nunca abre transação própria — Prisma não permite
 *   `$transaction` aninhado num `TransactionClient`.
 * - `*(prisma, ...)` — wrapper de entrada usado pelas rotas: abre a
 *   transação (`emTransacao`) e traduz erro de negócio (`erros-negocio-
 *   pacientes.ts`) antes de relançar.
 */
import type { PrismaClient } from '@prisma/client';
import { emTransacao, type ClienteTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { erroNaoEncontrado, erroSemPermissao, ErroHttp } from '@/server/http/erros';
import { traduzirErroNegocioPacientes } from './erros-negocio-pacientes';

export interface AtorContexto {
  ip: string;
  userAgent: string;
  requestId: string;
}

type ClienteQualquer = ClienteTransacao | PrismaClient;

interface LinhaAgendamento {
  id: string;
  paciente_id: string;
  rt_id: string;
  tipo: string;
  titulo: string;
  local: string | null;
  inicio_em: Date;
  fim_em: Date;
  acompanhante_colaborador_id: string | null;
  origem: string;
  criado_por_colaborador_id: string | null;
  criado_por_admin_id: string | null;
  status: string;
  observacoes: string | null;
  motivo_cancelamento: string | null;
  cancelado_em: Date | null;
  criado_em: Date;
}

function serializar(a: LinhaAgendamento) {
  return {
    id: a.id,
    pacienteId: a.paciente_id,
    rtId: a.rt_id,
    tipo: a.tipo,
    titulo: a.titulo,
    local: a.local,
    inicioEm: a.inicio_em.toISOString(),
    fimEm: a.fim_em.toISOString(),
    acompanhanteColaboradorId: a.acompanhante_colaborador_id,
    origem: a.origem,
    status: a.status,
    observacoes: a.observacoes,
    motivoCancelamento: a.motivo_cancelamento,
    canceladoEm: a.cancelado_em?.toISOString() ?? null,
    criadoEm: a.criado_em.toISOString(),
  };
}

// ----------------------------------------------------------------------------
// FN-010 — criar_agendamento (API-AGE-002)
// ----------------------------------------------------------------------------

export interface CriarAgendamentoInput {
  pacienteId: string;
  tipo: 'CONSULTA' | 'SAIDA';
  titulo: string;
  local?: string | undefined;
  inicioEm: string;
  fimEm: string;
  acompanhanteColaboradorId?: string | undefined;
  observacoes?: string | undefined;
}

export type OrigemAtor = { colaboradorId: string } | { adminId: string };

async function criarAgendamentoTx(tx: ClienteQualquer, input: CriarAgendamentoInput, ator: OrigemAtor, ctx: AtorContexto) {
  const origem = 'colaboradorId' in ator ? 'COLABORADOR' : 'ADMIN';
  const linhas = await tx.$queryRaw<LinhaAgendamento[]>`
    SELECT * FROM criar_agendamento(
      ${input.pacienteId}::uuid, ${input.tipo}::tipo_agendamento, ${input.titulo}, ${input.local ?? null},
      ${input.inicioEm}::timestamptz, ${input.fimEm}::timestamptz,
      ${input.acompanhanteColaboradorId ?? null}::uuid, ${input.observacoes ?? null},
      ${origem}::origem_agendamento,
      ${'colaboradorId' in ator ? ator.colaboradorId : null}::uuid,
      ${'adminId' in ator ? ator.adminId : null}::uuid
    )
  `;
  const agendamento = linhas[0];
  if (!agendamento) throw new ErroHttp({ status: 500, codigo: 'ERRO_INTERNO', mensagem: 'Falha ao criar agendamento.' });

  await registrarAuditoria(tx, {
    atorTipo: origem === 'COLABORADOR' ? 'COLABORADOR' : 'ADMIN',
    atorId: 'colaboradorId' in ator ? ator.colaboradorId : ator.adminId,
    acao: 'AGENDAMENTO_CRIADO',
    entidade: 'agendamento',
    entidadeId: agendamento.id,
    payload: { pacienteId: input.pacienteId, tipo: input.tipo, inicioEm: input.inicioEm },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return serializar(agendamento);
}

export async function criarAgendamento(prisma: PrismaClient, input: CriarAgendamentoInput, ator: OrigemAtor, ctx: AtorContexto) {
  try {
    return await emTransacao(prisma, (tx) => criarAgendamentoTx(tx, input, ator, ctx));
  } catch (erro) {
    const traduzido = traduzirErroNegocioPacientes(erro);
    if (traduzido) throw traduzido;
    throw erro;
  }
}

// ----------------------------------------------------------------------------
// FN-011 — cancelar_agendamento (API-AGE-004)
// ----------------------------------------------------------------------------

export async function cancelarAgendamentoTx(tx: ClienteQualquer, id: string, motivo: string, ator: OrigemAtor, ctx: AtorContexto) {
  const linhas = await tx.$queryRaw<LinhaAgendamento[]>`
    SELECT * FROM cancelar_agendamento(
      ${id}::uuid, ${motivo},
      ${'colaboradorId' in ator ? ator.colaboradorId : null}::uuid,
      ${'adminId' in ator ? ator.adminId : null}::uuid
    )
  `;
  const agendamento = linhas[0];
  if (!agendamento) throw new ErroHttp({ status: 500, codigo: 'ERRO_INTERNO', mensagem: 'Falha ao cancelar agendamento.' });

  await registrarAuditoria(tx, {
    atorTipo: 'colaboradorId' in ator ? 'COLABORADOR' : 'ADMIN',
    atorId: 'colaboradorId' in ator ? ator.colaboradorId : ator.adminId,
    acao: 'AGENDAMENTO_CANCELADO',
    entidade: 'agendamento',
    entidadeId: id,
    payload: { motivo },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return serializar(agendamento);
}

export async function cancelarAgendamento(prisma: PrismaClient, id: string, motivo: string, ator: OrigemAtor, ctx: AtorContexto) {
  try {
    return await emTransacao(prisma, (tx) => cancelarAgendamentoTx(tx, id, motivo, ator, ctx));
  } catch (erro) {
    const traduzido = traduzirErroNegocioPacientes(erro);
    if (traduzido) throw traduzido;
    throw erro;
  }
}

// ----------------------------------------------------------------------------
// RNP-09 — quem pode editar/cancelar: criador, acompanhante ou admin.
// ----------------------------------------------------------------------------

export function verificarPermissaoEdicao(
  agendamento: { criadoPorColaboradorId: string | null; acompanhanteColaboradorId: string | null },
  ator: { tipo: 'COLABORADOR'; colaboradorId: string } | { tipo: 'ADMIN' },
) {
  if (ator.tipo === 'ADMIN') return;
  if (agendamento.criadoPorColaboradorId === ator.colaboradorId) return;
  if (agendamento.acompanhanteColaboradorId === ator.colaboradorId) return;
  throw erroSemPermissao('Só quem criou, o acompanhante ou um admin pode alterar este agendamento.');
}

// ----------------------------------------------------------------------------
// API-AGE-003 — atualizar (horário, local, acompanhante, confirmar)
// ----------------------------------------------------------------------------

export interface AtualizarAgendamentoInput {
  titulo?: string | undefined;
  local?: string | undefined;
  inicioEm?: string | undefined;
  fimEm?: string | undefined;
  acompanhanteColaboradorId?: string | undefined;
  observacoes?: string | undefined;
  status?: 'CONFIRMADO' | undefined;
}

export async function atualizarAgendamentoNaRt(
  prisma: PrismaClient,
  id: string,
  rtId: string,
  input: AtualizarAgendamentoInput,
  ator: { tipo: 'COLABORADOR'; colaboradorId: string } | { tipo: 'ADMIN' },
  ctx: AtorContexto,
) {
  const atual = await prisma.agendamento.findFirst({ where: { id, rtId } });
  if (!atual) throw erroNaoEncontrado('Agendamento não encontrado.');
  if (atual.status !== 'AGENDADO' && atual.status !== 'CONFIRMADO') {
    throw new ErroHttp({ status: 409, codigo: 'AGENDAMENTO_JA_ENCERRADO', mensagem: 'Este agendamento já foi concluído ou cancelado.' });
  }

  verificarPermissaoEdicao(atual, ator);

  const horarioMudou = (input.inicioEm && input.inicioEm !== atual.inicioEm.toISOString()) || (input.fimEm && input.fimEm !== atual.fimEm.toISOString());

  return emTransacao(prisma, async (tx) => {
    const atualizado = await tx.agendamento.update({
      where: { id },
      data: {
        ...(input.titulo !== undefined ? { titulo: input.titulo } : {}),
        ...(input.local !== undefined ? { local: input.local } : {}),
        ...(input.inicioEm !== undefined ? { inicioEm: new Date(input.inicioEm) } : {}),
        ...(input.fimEm !== undefined ? { fimEm: new Date(input.fimEm) } : {}),
        ...(input.acompanhanteColaboradorId !== undefined ? { acompanhanteColaboradorId: input.acompanhanteColaboradorId } : {}),
        ...(input.observacoes !== undefined ? { observacoes: input.observacoes } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    await registrarAuditoria(tx, {
      atorTipo: ator.tipo,
      atorId: ator.tipo === 'COLABORADOR' ? ator.colaboradorId : null,
      acao: 'AGENDAMENTO_ATUALIZADO',
      entidade: 'agendamento',
      entidadeId: id,
      payload: {
        campos: Object.keys(input),
        ...(atual.status === 'CONFIRMADO' && horarioMudou ? { inicioAnterior: atual.inicioEm.toISOString(), fimAnterior: atual.fimEm.toISOString() } : {}),
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return atualizado;
  });
}

// ----------------------------------------------------------------------------
// API-AGE-005 — concluir (RNP-10: só depois de fim_em)
// ----------------------------------------------------------------------------

export async function concluirAgendamentoNaRt(
  prisma: PrismaClient,
  id: string,
  rtId: string,
  status: 'REALIZADO' | 'NAO_COMPARECEU',
  observacoes: string | undefined,
  ator: { tipo: 'COLABORADOR'; colaboradorId: string } | { tipo: 'ADMIN' },
  ctx: AtorContexto,
) {
  const atual = await prisma.agendamento.findFirst({ where: { id, rtId } });
  if (!atual) throw erroNaoEncontrado('Agendamento não encontrado.');
  if (atual.status !== 'AGENDADO' && atual.status !== 'CONFIRMADO') {
    throw new ErroHttp({ status: 409, codigo: 'AGENDAMENTO_JA_ENCERRADO', mensagem: 'Este agendamento já foi concluído ou cancelado.' });
  }
  if (new Date() < atual.fimEm) {
    throw new ErroHttp({ status: 409, codigo: 'AGENDAMENTO_NAO_FINALIZAVEL', mensagem: 'Este agendamento ainda não terminou.' });
  }

  return emTransacao(prisma, async (tx) => {
    const atualizado = await tx.agendamento.update({ where: { id }, data: { status, observacoes: observacoes ?? atual.observacoes } });

    await registrarAuditoria(tx, {
      atorTipo: ator.tipo,
      atorId: ator.tipo === 'COLABORADOR' ? ator.colaboradorId : null,
      acao: 'AGENDAMENTO_CONCLUIDO',
      entidade: 'agendamento',
      entidadeId: id,
      payload: { status },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return atualizado;
  });
}

// ----------------------------------------------------------------------------
// FN-013 — agenda_rt (API-AGE-001)
// ----------------------------------------------------------------------------

interface LinhaAgendaRt {
  agendamento_id: string;
  paciente_id: string;
  paciente_nome: string;
  tipo: string;
  titulo: string;
  local: string | null;
  inicio_em: Date;
  fim_em: Date;
  status: string;
  acompanhante_nome: string | null;
}

export async function agendaRt(prisma: PrismaClient, rtId: string, de: string, ate: string) {
  const linhas = await prisma.$queryRaw<LinhaAgendaRt[]>`SELECT * FROM agenda_rt(${rtId}::uuid, ${de}::date, ${ate}::date)`;
  return linhas.map((l) => ({
    id: l.agendamento_id,
    pacienteId: l.paciente_id,
    pacienteNome: l.paciente_nome,
    tipo: l.tipo,
    titulo: l.titulo,
    local: l.local,
    inicioEm: l.inicio_em.toISOString(),
    fimEm: l.fim_em.toISOString(),
    status: l.status,
    acompanhanteNome: l.acompanhante_nome,
  }));
}
