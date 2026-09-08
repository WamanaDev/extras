/**
 * API-ADM-PAC-*, API-PAC-* — CRUD de paciente (admin) + leitura escopada por
 * RT (colaborador, RNP-01).
 *
 * Paciente não tem função SQL dedicada (CRUD simples, sem regra
 * concorrente) — Prisma direto, dentro de `emTransacao` só quando a
 * operação tem efeito colateral (inativar cancela agendamentos futuros).
 */
import type { PrismaClient, StatusPaciente } from '@prisma/client';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { erroDeNegocio, erroNaoEncontrado, ErroHttp } from '@/server/http/erros';
import { cancelarAgendamentoTx } from './agendamentos';

export interface AtorContexto {
  ip: string;
  userAgent: string;
  requestId: string;
}

// ----------------------------------------------------------------------------
// Admin — API-ADM-PAC-001..004
// ----------------------------------------------------------------------------

export interface ListarPacientesAdminParams {
  rtId?: string | undefined;
  status?: StatusPaciente | undefined;
  busca?: string | undefined;
  pagina: number;
  tamanho: number;
}

export async function listarPacientesAdmin(prisma: PrismaClient, params: ListarPacientesAdminParams) {
  const where = {
    ...(params.rtId ? { rtId: params.rtId } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.busca ? { nome: { contains: params.busca, mode: 'insensitive' as const } } : {}),
  };

  const [itens, total] = await Promise.all([
    prisma.paciente.findMany({
      where,
      orderBy: { nome: 'asc' },
      skip: (params.pagina - 1) * params.tamanho,
      take: params.tamanho,
      select: { id: true, nome: true, dataNascimento: true, rtId: true, status: true, rt: { select: { nome: true } } },
    }),
    prisma.paciente.count({ where }),
  ]);

  return {
    itens: itens.map((p) => ({
      id: p.id,
      nome: p.nome,
      dataNascimento: p.dataNascimento.toISOString().slice(0, 10),
      rtId: p.rtId,
      rtNome: p.rt.nome,
      status: p.status,
    })),
    total,
  };
}

export interface CriarPacienteInput {
  nome: string;
  dataNascimento: string;
  rtId: string;
  cpf?: string | undefined;
  nomeResponsavel?: string | undefined;
  contatoResponsavel?: string | undefined;
  observacoesClinicas?: string | undefined;
}

export async function criarPaciente(prisma: PrismaClient, input: CriarPacienteInput, atorAdminId: string, ctx: AtorContexto) {
  const rt = await prisma.rt.findUnique({ where: { id: input.rtId } });
  if (!rt || !rt.ativo) throw erroDeNegocio('RT inválida ou inativa.', 'RT_INVALIDA');

  if (input.cpf) {
    const existente = await prisma.paciente.findFirst({ where: { cpf: input.cpf } });
    if (existente) throw erroDeNegocio('Já existe um paciente cadastrado com este CPF.', 'CPF_JA_CADASTRADO');
  }

  return emTransacao(prisma, async (tx) => {
    const paciente = await tx.paciente.create({
      data: {
        nome: input.nome,
        dataNascimento: new Date(`${input.dataNascimento}T00:00:00Z`),
        rtId: input.rtId,
        criadoPorId: atorAdminId,
        ...(input.cpf !== undefined ? { cpf: input.cpf } : {}),
        ...(input.nomeResponsavel !== undefined ? { nomeResponsavel: input.nomeResponsavel } : {}),
        ...(input.contatoResponsavel !== undefined ? { contatoResponsavel: input.contatoResponsavel } : {}),
        ...(input.observacoesClinicas !== undefined ? { observacoesClinicas: input.observacoesClinicas } : {}),
      },
    });

    // SEC-SAUDE: observacoesClinicas nunca vai para o payload de auditoria.
    await registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: atorAdminId,
      acao: 'PACIENTE_CRIADO',
      entidade: 'paciente',
      entidadeId: paciente.id,
      payload: { rtId: input.rtId, temObservacoesClinicas: Boolean(input.observacoesClinicas) },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return paciente;
  });
}

export interface AtualizarPacienteInput {
  nome?: string | undefined;
  rtId?: string | undefined;
  cpf?: string | undefined;
  nomeResponsavel?: string | undefined;
  contatoResponsavel?: string | undefined;
  observacoesClinicas?: string | undefined;
}

export async function atualizarPaciente(prisma: PrismaClient, id: string, input: AtualizarPacienteInput, atorAdminId: string, ctx: AtorContexto) {
  const atual = await prisma.paciente.findUnique({ where: { id } });
  if (!atual) throw erroNaoEncontrado('Paciente não encontrado.');

  if (input.rtId) {
    const rt = await prisma.rt.findUnique({ where: { id: input.rtId } });
    if (!rt || !rt.ativo) throw erroDeNegocio('RT inválida ou inativa.', 'RT_INVALIDA');
  }

  return emTransacao(prisma, async (tx) => {
    const atualizado = await tx.paciente.update({
      where: { id },
      data: {
        ...(input.nome !== undefined ? { nome: input.nome } : {}),
        ...(input.rtId !== undefined ? { rtId: input.rtId } : {}),
        ...(input.cpf !== undefined ? { cpf: input.cpf } : {}),
        ...(input.nomeResponsavel !== undefined ? { nomeResponsavel: input.nomeResponsavel } : {}),
        ...(input.contatoResponsavel !== undefined ? { contatoResponsavel: input.contatoResponsavel } : {}),
        ...(input.observacoesClinicas !== undefined ? { observacoesClinicas: input.observacoesClinicas } : {}),
      },
    });

    await registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: atorAdminId,
      acao: 'PACIENTE_ATUALIZADO',
      entidade: 'paciente',
      entidadeId: id,
      payload: {
        campos: Object.keys(input),
        rtAnterior: atual.rtId,
        rtNovo: input.rtId ?? atual.rtId,
        temObservacoesClinicas: input.observacoesClinicas !== undefined ? Boolean(input.observacoesClinicas) : undefined,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return atualizado;
  });
}

export async function inativarPaciente(prisma: PrismaClient, id: string, motivo: string, atorAdminId: string, ctx: AtorContexto) {
  if (!motivo || motivo.trim() === '') throw new ErroHttp({ status: 422, codigo: 'MOTIVO_OBRIGATORIO', mensagem: 'Informe o motivo da inativação.' });

  const atual = await prisma.paciente.findUnique({ where: { id } });
  if (!atual) throw erroNaoEncontrado('Paciente não encontrado.');

  return emTransacao(prisma, async (tx) => {
    const atualizado = await tx.paciente.update({ where: { id }, data: { status: 'INATIVO' } });

    const agendamentosFuturos = await tx.agendamento.findMany({
      where: { pacienteId: id, status: { in: ['AGENDADO', 'CONFIRMADO'] } },
      select: { id: true },
    });
    for (const ag of agendamentosFuturos) {
      await cancelarAgendamentoTx(tx, ag.id, `Paciente inativado: ${motivo}`, { adminId: atorAdminId }, ctx);
    }

    await tx.prescricao.updateMany({
      where: { pacienteId: id, status: 'ATIVA' },
      data: { status: 'ENCERRADA' },
    });

    await registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: atorAdminId,
      acao: 'PACIENTE_INATIVADO',
      entidade: 'paciente',
      entidadeId: id,
      payload: { motivo, agendamentosCancelados: agendamentosFuturos.length },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return atualizado;
  });
}

// ----------------------------------------------------------------------------
// Colaborador — API-PAC-001/002 (RNP-01: só a própria RT)
// ----------------------------------------------------------------------------

export async function listarPacientesRt(prisma: PrismaClient, rtId: string) {
  const pacientes = await prisma.paciente.findMany({
    where: { rtId, status: 'ATIVO' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, status: true },
  });
  return pacientes;
}

export async function obterPacienteRt(prisma: PrismaClient, id: string, rtId: string) {
  const paciente = await prisma.paciente.findFirst({
    where: { id, rtId },
    select: { id: true, nome: true, dataNascimento: true, nomeResponsavel: true, contatoResponsavel: true, observacoesClinicas: true },
  });
  if (!paciente) throw erroNaoEncontrado('Paciente não encontrado.');

  const proximosAgendamentos = await prisma.agendamento.findMany({
    where: { pacienteId: id, status: { in: ['AGENDADO', 'CONFIRMADO'] }, inicioEm: { gte: new Date() } },
    orderBy: { inicioEm: 'asc' },
    take: 5,
    select: { id: true, tipo: true, titulo: true, inicioEm: true, status: true },
  });

  return {
    id: paciente.id,
    nome: paciente.nome,
    dataNascimento: paciente.dataNascimento.toISOString().slice(0, 10),
    nomeResponsavel: paciente.nomeResponsavel,
    contatoResponsavel: paciente.contatoResponsavel,
    observacoesClinicas: paciente.observacoesClinicas,
    proximosAgendamentos: proximosAgendamentos.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      titulo: a.titulo,
      inicioEm: a.inicioEm.toISOString(),
      status: a.status,
    })),
  };
}
