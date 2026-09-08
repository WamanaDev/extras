/**
 * API-MED-* — Catálogo de medicamentos, prescrição (receita) e checagem
 * dupla (separar → conferir → administrar). FN-012 `separar_medicamento`,
 * FN-014 `alertas_medicamento`, FN-015 `conferir_medicamento`, FN-016
 * `administrar_medicamento`.
 *
 * RT do paciente é sempre resolvida via join (prescrição → paciente,
 * administração → prescrição → paciente) e comparada à RT do ator — nunca
 * confiada a um campo do corpo da requisição (RNP-01, RNP-31).
 */
import type { PrismaClient } from '@prisma/client';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { erroDeNegocio, erroNaoEncontrado, ErroHttp } from '@/server/http/erros';
import { traduzirErroNegocioPacientes } from './erros-negocio-pacientes';

export interface AtorContexto {
  ip: string;
  userAgent: string;
  requestId: string;
}

export type OrigemAtor = { colaboradorId: string } | { adminId: string };

const TETO_VIGENCIA_DIAS = 366;

// ----------------------------------------------------------------------------
// Catálogo (referência — mesmo racional de código de escala)
// ----------------------------------------------------------------------------

export async function listarMedicamentos(prisma: PrismaClient, busca?: string) {
  return prisma.medicamento.findMany({
    where: { ativo: true, ...(busca ? { nome: { contains: busca, mode: 'insensitive' as const } } : {}) },
    orderBy: { nome: 'asc' },
  });
}

export async function criarMedicamento(prisma: PrismaClient, nome: string, principioAtivo: string | undefined) {
  return prisma.medicamento.create({ data: { nome, ...(principioAtivo !== undefined ? { principioAtivo } : {}) } });
}

// ----------------------------------------------------------------------------
// API-MED-001/002/003/004 — Prescrição
// ----------------------------------------------------------------------------

async function pacienteDaRt(prisma: PrismaClient, pacienteId: string, rtId: string) {
  const paciente = await prisma.paciente.findFirst({ where: { id: pacienteId, rtId } });
  if (!paciente) throw erroNaoEncontrado('Paciente não encontrado.');
  return paciente;
}

export async function listarPrescricoes(prisma: PrismaClient, pacienteId: string, rtId: string, status: 'ATIVA' | 'SUSPENSA' | 'ENCERRADA' = 'ATIVA') {
  await pacienteDaRt(prisma, pacienteId, rtId);
  const prescricoes = await prisma.prescricao.findMany({
    where: { pacienteId, status },
    orderBy: { criadoEm: 'desc' },
    include: { medicamento: { select: { nome: true } }, criadoPorColaborador: { select: { nome: true } } },
  });
  return prescricoes.map((p) => ({
    id: p.id,
    medicamentoNome: p.medicamento.nome,
    dose: p.dose,
    via: p.via,
    tipo: p.tipo,
    duracao: p.duracao,
    horarios: p.horarios,
    dataInicio: p.dataInicio.toISOString().slice(0, 10),
    dataFim: p.dataFim?.toISOString().slice(0, 10) ?? null,
    instrucoes: p.instrucoes,
    status: p.status,
    criadoPorNome: p.criadoPorColaborador?.nome ?? null,
  }));
}

export interface CriarPrescricaoInput {
  medicamentoId: string;
  tipo: 'REGULAR' | 'PRN';
  duracao: 'DEFINITIVA' | 'TEMPORARIA';
  dose: string;
  via: string;
  horarios?: string[] | undefined;
  dataInicio: string;
  dataFim?: string | undefined;
  prescritoPor: string;
  instrucoes?: string | undefined;
}

function horarioParaData(dataCivil: string, horaMin: string): Date {
  return new Date(`${dataCivil}T${horaMin}:00`);
}

function proximoDia(dataCivil: string): string {
  const d = new Date(`${dataCivil}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function criarPrescricao(prisma: PrismaClient, pacienteId: string, rtId: string, input: CriarPrescricaoInput, ator: OrigemAtor, ctx: AtorContexto) {
  await pacienteDaRt(prisma, pacienteId, rtId);

  const medicamento = await prisma.medicamento.findUnique({ where: { id: input.medicamentoId } });
  if (!medicamento || !medicamento.ativo) throw erroDeNegocio('Medicamento inexistente ou inativo.', 'MEDICAMENTO_INEXISTENTE');

  if (input.tipo === 'REGULAR' && (!input.horarios || input.horarios.length === 0)) {
    throw erroDeNegocio('Informe ao menos um horário para uma prescrição de horários fixos.', 'HORARIOS_OBRIGATORIOS');
  }
  if (input.duracao === 'TEMPORARIA' && !input.dataFim) {
    throw erroDeNegocio('Prescrição temporária precisa de uma data de término.', 'VIGENCIA_INCONSISTENTE');
  }
  if (input.duracao === 'DEFINITIVA' && input.dataFim) {
    throw erroDeNegocio('Prescrição definitiva não tem data de término.', 'VIGENCIA_INCONSISTENTE');
  }

  let dataFimGeracao = input.dataFim;
  if (!dataFimGeracao) {
    const teto = new Date(`${input.dataInicio}T00:00:00Z`);
    teto.setUTCDate(teto.getUTCDate() + TETO_VIGENCIA_DIAS);
    dataFimGeracao = teto.toISOString().slice(0, 10);
  }

  const origem = 'colaboradorId' in ator ? 'COLABORADOR' : 'ADMIN';

  return emTransacao(prisma, async (tx) => {
    const prescricao = await tx.prescricao.create({
      data: {
        pacienteId,
        medicamentoId: input.medicamentoId,
        tipo: input.tipo,
        duracao: input.duracao,
        dose: input.dose,
        via: input.via,
        horarios: input.tipo === 'REGULAR' ? (input.horarios ?? []) : [],
        dataInicio: new Date(`${input.dataInicio}T00:00:00Z`),
        dataFim: input.dataFim ? new Date(`${input.dataFim}T00:00:00Z`) : null,
        prescritoPor: input.prescritoPor,
        origem,
        ...(input.instrucoes !== undefined ? { instrucoes: input.instrucoes } : {}),
        ...('colaboradorId' in ator ? { criadoPorColaboradorId: ator.colaboradorId } : {}),
        ...('adminId' in ator ? { criadoPorAdminId: ator.adminId } : {}),
      },
    });

    let geradas = 0;
    if (input.tipo === 'REGULAR') {
      const linhas: { prescricaoId: string; horarioPrevisto: Date }[] = [];
      for (let dia = input.dataInicio; dia <= dataFimGeracao; dia = proximoDia(dia)) {
        for (const horario of input.horarios ?? []) {
          linhas.push({ prescricaoId: prescricao.id, horarioPrevisto: horarioParaData(dia, horario) });
        }
      }
      if (linhas.length > 0) {
        const resultado = await tx.administracaoMedicamento.createMany({ data: linhas });
        geradas = resultado.count;
      }
    }

    // SEC-SAUDE: instrucoes nunca vai para o payload de auditoria.
    await registrarAuditoria(tx, {
      atorTipo: origem,
      atorId: 'colaboradorId' in ator ? ator.colaboradorId : ator.adminId,
      acao: 'PRESCRICAO_CRIADA',
      entidade: 'prescricao',
      entidadeId: prescricao.id,
      payload: { pacienteId, medicamentoId: input.medicamentoId, tipo: input.tipo, duracao: input.duracao, dosesGeradas: geradas },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return prescricao;
  });
}

const CAMPOS_MUTAVEIS = new Set(['dose', 'via', 'instrucoes']);

export interface AtualizarPrescricaoInput {
  dose?: string | undefined;
  via?: string | undefined;
  instrucoes?: string | undefined;
  [chave: string]: unknown;
}

export async function atualizarPrescricao(prisma: PrismaClient, id: string, rtId: string | null, input: AtualizarPrescricaoInput, ator: OrigemAtor, ctx: AtorContexto) {
  const atual = await prisma.prescricao.findFirst({ where: { id, ...(rtId ? { paciente: { rtId } } : {}) } });
  if (!atual) throw erroNaoEncontrado('Prescrição não encontrada.');
  if (atual.status !== 'ATIVA') throw erroDeNegocio('Esta prescrição não está ativa.', 'PRESCRICAO_NAO_ATIVA');

  for (const campo of Object.keys(input)) {
    if (!CAMPOS_MUTAVEIS.has(campo)) throw erroDeNegocio(`O campo "${campo}" não pode ser alterado nesta prescrição.`, 'CAMPO_IMUTAVEL');
  }

  return emTransacao(prisma, async (tx) => {
    const atualizado = await tx.prescricao.update({
      where: { id },
      data: {
        ...(input.dose !== undefined ? { dose: input.dose } : {}),
        ...(input.via !== undefined ? { via: input.via } : {}),
        ...(input.instrucoes !== undefined ? { instrucoes: input.instrucoes } : {}),
      },
    });

    await registrarAuditoria(tx, {
      atorTipo: 'colaboradorId' in ator ? 'COLABORADOR' : 'ADMIN',
      atorId: 'colaboradorId' in ator ? ator.colaboradorId : ator.adminId,
      acao: 'PRESCRICAO_ATUALIZADA',
      entidade: 'prescricao',
      entidadeId: id,
      payload: { campos: Object.keys(input) },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return atualizado;
  });
}

export async function encerrarPrescricao(
  prisma: PrismaClient,
  id: string,
  rtId: string | null,
  novoStatus: 'SUSPENSA' | 'ENCERRADA',
  motivo: string,
  ator: OrigemAtor,
  ctx: AtorContexto,
) {
  if (!motivo || motivo.trim() === '') throw new ErroHttp({ status: 422, codigo: 'MOTIVO_OBRIGATORIO', mensagem: 'Informe o motivo.' });

  const atual = await prisma.prescricao.findFirst({ where: { id, ...(rtId ? { paciente: { rtId } } : {}) } });
  if (!atual) throw erroNaoEncontrado('Prescrição não encontrada.');

  return emTransacao(prisma, async (tx) => {
    const atualizado = await tx.prescricao.update({ where: { id }, data: { status: novoStatus } });

    const canceladas = await tx.administracaoMedicamento.updateMany({
      where: { prescricaoId: id, status: 'PENDENTE', horarioPrevisto: { gt: new Date() } },
      data: { status: 'NAO_ADMINISTRADO' },
    });

    await registrarAuditoria(tx, {
      atorTipo: 'colaboradorId' in ator ? 'COLABORADOR' : 'ADMIN',
      atorId: 'colaboradorId' in ator ? ator.colaboradorId : ator.adminId,
      acao: novoStatus === 'ENCERRADA' ? 'PRESCRICAO_ENCERRADA' : 'PRESCRICAO_SUSPENSA',
      entidade: 'prescricao',
      entidadeId: id,
      payload: { motivo, dosesCanceladas: canceladas.count },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return atualizado;
  });
}

// ----------------------------------------------------------------------------
// FN-012/015/016 — checagem dupla
// ----------------------------------------------------------------------------

interface LinhaAdministracao {
  id: string;
  prescricao_id: string;
  horario_previsto: Date | null;
  status: string;
  separado_por_id: string | null;
  separado_em: Date | null;
  conferido_por_id: string | null;
  conferido_em: Date | null;
  administrado_por_id: string | null;
  administrado_em: Date | null;
  observacao: string | null;
  criado_em: Date;
}

function serializarAdministracao(a: LinhaAdministracao) {
  return {
    id: a.id,
    prescricaoId: a.prescricao_id,
    horarioPrevisto: a.horario_previsto?.toISOString() ?? null,
    status: a.status,
    separadoPorId: a.separado_por_id,
    separadoEm: a.separado_em?.toISOString() ?? null,
    conferidoPorId: a.conferido_por_id,
    conferidoEm: a.conferido_em?.toISOString() ?? null,
    administradoPorId: a.administrado_por_id,
    administradoEm: a.administrado_em?.toISOString() ?? null,
    observacao: a.observacao,
  };
}

async function prescricaoDaRt(prisma: PrismaClient, prescricaoId: string, rtId: string) {
  const prescricao = await prisma.prescricao.findFirst({ where: { id: prescricaoId, paciente: { rtId } } });
  if (!prescricao) throw erroNaoEncontrado('Prescrição não encontrada.');
  return prescricao;
}

async function administracaoDaRt(prisma: PrismaClient, administracaoId: string, rtId: string) {
  const administracao = await prisma.administracaoMedicamento.findFirst({
    where: { id: administracaoId, prescricao: { paciente: { rtId } } },
  });
  if (!administracao) throw erroNaoEncontrado('Registro de administração não encontrado.');
  return administracao;
}

export async function separarMedicamento(prisma: PrismaClient, prescricaoId: string, rtId: string, colaboradorId: string, horarioPrevisto: string | undefined, ctx: AtorContexto) {
  await prescricaoDaRt(prisma, prescricaoId, rtId);

  try {
    return await emTransacao(prisma, async (tx) => {
      const linhas = await tx.$queryRaw<LinhaAdministracao[]>`
        SELECT * FROM separar_medicamento(${prescricaoId}::uuid, ${colaboradorId}::uuid, ${horarioPrevisto ?? null}::timestamptz)
      `;
      const administracao = linhas[0];
      if (!administracao) throw new ErroHttp({ status: 500, codigo: 'ERRO_INTERNO', mensagem: 'Falha ao separar medicamento.' });

      await registrarAuditoria(tx, {
        atorTipo: 'COLABORADOR',
        atorId: colaboradorId,
        acao: 'MEDICACAO_SEPARADA',
        entidade: 'administracao_medicamento',
        entidadeId: administracao.id,
        payload: { prescricaoId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });

      return serializarAdministracao(administracao);
    });
  } catch (erro) {
    const traduzido = traduzirErroNegocioPacientes(erro);
    if (traduzido) throw traduzido;
    throw erro;
  }
}

export async function conferirMedicamento(
  prisma: PrismaClient,
  administracaoId: string,
  rtId: string,
  colaboradorId: string,
  confere: boolean,
  observacao: string | undefined,
  ctx: AtorContexto,
) {
  await administracaoDaRt(prisma, administracaoId, rtId);

  try {
    return await emTransacao(prisma, async (tx) => {
      const linhas = await tx.$queryRaw<LinhaAdministracao[]>`
        SELECT * FROM conferir_medicamento(${administracaoId}::uuid, ${colaboradorId}::uuid, ${confere}, ${observacao ?? null})
      `;
      const administracao = linhas[0];
      if (!administracao) throw new ErroHttp({ status: 500, codigo: 'ERRO_INTERNO', mensagem: 'Falha ao conferir medicamento.' });

      await registrarAuditoria(tx, {
        atorTipo: 'COLABORADOR',
        atorId: colaboradorId,
        acao: confere ? 'MEDICACAO_CONFERIDA' : 'MEDICACAO_DIVERGENTE',
        entidade: 'administracao_medicamento',
        entidadeId: administracao.id,
        payload: { confere },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });

      return { ...serializarAdministracao(administracao), proximaAcao: administracao.status === 'DIVERGENTE' ? 'nova_separacao' : null };
    });
  } catch (erro) {
    const traduzido = traduzirErroNegocioPacientes(erro);
    if (traduzido) throw traduzido;
    throw erro;
  }
}

export async function administrarMedicamento(
  prisma: PrismaClient,
  administracaoId: string,
  rtId: string,
  colaboradorId: string,
  status: 'ADMINISTRADO' | 'RECUSADO',
  observacao: string | undefined,
  ctx: AtorContexto,
) {
  await administracaoDaRt(prisma, administracaoId, rtId);

  try {
    return await emTransacao(prisma, async (tx) => {
      const linhas = await tx.$queryRaw<LinhaAdministracao[]>`
        SELECT * FROM administrar_medicamento(${administracaoId}::uuid, ${colaboradorId}::uuid, ${status}::status_administracao, ${observacao ?? null})
      `;
      const administracao = linhas[0];
      if (!administracao) throw new ErroHttp({ status: 500, codigo: 'ERRO_INTERNO', mensagem: 'Falha ao administrar medicamento.' });

      await registrarAuditoria(tx, {
        atorTipo: 'COLABORADOR',
        atorId: colaboradorId,
        acao: status === 'ADMINISTRADO' ? 'MEDICACAO_ADMINISTRADA' : 'MEDICACAO_RECUSADA',
        entidade: 'administracao_medicamento',
        entidadeId: administracao.id,
        payload: {},
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });

      return serializarAdministracao(administracao);
    });
  } catch (erro) {
    const traduzido = traduzirErroNegocioPacientes(erro);
    if (traduzido) throw traduzido;
    throw erro;
  }
}

// ----------------------------------------------------------------------------
// API-MED-006 — MAR do paciente
// ----------------------------------------------------------------------------

export async function listarAdministracoes(prisma: PrismaClient, pacienteId: string, rtId: string, de: string, ate: string) {
  await pacienteDaRt(prisma, pacienteId, rtId);

  const administracoes = await prisma.administracaoMedicamento.findMany({
    where: {
      prescricao: { pacienteId },
      OR: [
        { horarioPrevisto: { gte: new Date(`${de}T00:00:00Z`), lt: new Date(`${proximoDia(ate)}T00:00:00Z`) } },
        { horarioPrevisto: null, criadoEm: { gte: new Date(`${de}T00:00:00Z`), lt: new Date(`${proximoDia(ate)}T00:00:00Z`) } },
      ],
    },
    orderBy: [{ horarioPrevisto: 'asc' }, { criadoEm: 'asc' }],
    include: {
      prescricao: { select: { dose: true, medicamento: { select: { nome: true } } } },
      separadoPor: { select: { nome: true } },
      conferidoPor: { select: { nome: true } },
      administradoPor: { select: { nome: true } },
    },
  });

  return administracoes.map((a) => ({
    id: a.id,
    prescricaoId: a.prescricaoId,
    medicamentoNome: a.prescricao.medicamento.nome,
    dose: a.prescricao.dose,
    horarioPrevisto: a.horarioPrevisto?.toISOString() ?? null,
    status: a.status,
    separadoPorId: a.separadoPorId,
    separadoPorNome: a.separadoPor?.nome ?? null,
    separadoEm: a.separadoEm?.toISOString() ?? null,
    conferidoPorId: a.conferidoPorId,
    conferidoPorNome: a.conferidoPor?.nome ?? null,
    conferidoEm: a.conferidoEm?.toISOString() ?? null,
    administradoPorId: a.administradoPorId,
    administradoPorNome: a.administradoPor?.nome ?? null,
    administradoEm: a.administradoEm?.toISOString() ?? null,
    observacao: a.observacao,
  }));
}

// ----------------------------------------------------------------------------
// FN-014 — alertas_medicamento (API-MED-007)
// ----------------------------------------------------------------------------

interface LinhaAlerta {
  administracao_id: string;
  prescricao_id: string;
  paciente_id: string;
  paciente_nome: string;
  medicamento_nome: string;
  horario_previsto: Date | null;
  etapa_parada: string;
  minutos_atraso: number;
}

export async function alertasMedicamento(prisma: PrismaClient, rtId: string, toleranciaMinutos = 30) {
  const linhas = await prisma.$queryRaw<LinhaAlerta[]>`SELECT * FROM alertas_medicamento(${rtId}::uuid, ${toleranciaMinutos}::int)`;
  return linhas.map((l) => ({
    administracaoId: l.administracao_id,
    pacienteId: l.paciente_id,
    pacienteNome: l.paciente_nome,
    medicamentoNome: l.medicamento_nome,
    horarioPrevisto: l.horario_previsto?.toISOString() ?? null,
    etapaParada: l.etapa_parada,
    minutosAtraso: l.minutos_atraso,
  }));
}
