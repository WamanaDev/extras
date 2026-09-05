/**
 * API-ADM-REL-004 — `GET /api/admin/seguranca/tentativas`.
 *
 * Painel de segurança: agrega `tentativa_login` na janela pedida, marca IP
 * suspeito (regra da spec: mais de 3 matrículas distintas OU mais de 10
 * falhas), lista contas bloqueadas e conta sessões ativas.
 *
 * ## Retenção (SEC-CONF)
 * "IP é dado pessoal indireto (...) a retenção de 90 dias limita o uso." A
 * janela aceita só `24h`/`7d` (sempre < 90 dias), então o corte de retenção
 * nunca deveria importar na prática — mas `calcularInicioJanela` aplica o
 * teto de 90 dias mesmo assim, como defesa em profundidade caso o job de
 * expurgo (`SEC-CONF`, "Retenção e expurgo") atrase e deixe linha antiga na
 * tabela: o painel de segurança nunca expõe tentativa fora da retenção
 * declarada, independente do estado do job de expurgo.
 *
 * ## `apenasSuspeitas`
 * A spec não detalha o efeito exato deste parâmetro nos testes de aceitação
 * (#1-#5 não o exercitam) — `ipsSuspeitos` já é, pelo próprio nome do campo
 * do contrato, só os IPs que passam no limiar (isso não muda com o
 * parâmetro). Decisão adotada e registrada em `_conflitos.md`: quando
 * `true`, filtra `contasBloqueadas` para só as contas cujo IP de origem das
 * tentativas está entre os suspeitos — sem isso, um colega que errou o
 * próprio PIN e ficou bloqueado (ruído comum, "R" da spec) polui o painel
 * focado em investigar ataque.
 */
import type { PrismaClient } from '@prisma/client';

export type JanelaSeguranca = '24h' | '7d';

const RETENCAO_DIAS = 90;
const LIMIAR_MATRICULAS_DISTINTAS = 3;
const LIMIAR_FALHAS = 10;
const MS_POR_HORA = 60 * 60 * 1000;
const MS_POR_DIA = 24 * MS_POR_HORA;

export interface FiltroSeguranca {
  janela: JanelaSeguranca;
  apenasSuspeitas: boolean;
}

export interface ContaBloqueada {
  colaboradorId: string;
  nome: string;
  matricula: string;
  bloqueadoAte: string;
  falhas: number;
}

export interface IpSuspeito {
  ip: string;
  tentativas: number;
  matriculasDistintas: number;
  primeiraEm: string;
  ultimaEm: string;
}

export interface PainelSeguranca {
  contasBloqueadas: ContaBloqueada[];
  ipsSuspeitos: IpSuspeito[];
  sessoesAtivas: number;
  resumo: { tentativas: number; falhas: number; taxaFalha: number };
}

function horasDaJanela(janela: JanelaSeguranca): number {
  return janela === '24h' ? 24 : 7 * 24;
}

/** Início da janela pedida, nunca antes do teto de retenção de 90 dias (ver doc-comment do módulo). */
export function calcularInicioJanela(agora: Date, janela: JanelaSeguranca): Date {
  const inicioPedido = new Date(agora.getTime() - horasDaJanela(janela) * MS_POR_HORA);
  const limiteRetencao = new Date(agora.getTime() - RETENCAO_DIAS * MS_POR_DIA);
  return inicioPedido.getTime() > limiteRetencao.getTime() ? inicioPedido : limiteRetencao;
}

interface TentativaRow {
  matricula: string;
  sucesso: boolean;
  ip: string;
  criadoEm: Date;
}

interface AcumuladorIp {
  tentativas: number;
  falhas: number;
  matriculas: Set<string>;
  primeiraEm: Date;
  ultimaEm: Date;
}

export async function montarPainelSeguranca(
  prisma: PrismaClient,
  agora: Date,
  filtro: FiltroSeguranca,
): Promise<PainelSeguranca> {
  const inicio = calcularInicioJanela(agora, filtro.janela);

  const [tentativas, colaboradoresBloqueados, sessoesAtivas] = await Promise.all([
    prisma.tentativaLogin.findMany({
      where: { criadoEm: { gte: inicio } },
      select: { matricula: true, sucesso: true, ip: true, criadoEm: true },
    }) as unknown as Promise<TentativaRow[]>,
    prisma.colaborador.findMany({
      where: { bloqueadoAte: { gt: agora } },
      select: { id: true, nome: true, matricula: true, bloqueadoAte: true, tentativasFalhas: true },
    }),
    prisma.sessaoColaborador.count({ where: { revogadaEm: null, expiraEm: { gt: agora } } }),
  ]);

  const porIp = new Map<string, AcumuladorIp>();
  let falhasTotais = 0;
  for (const tentativa of tentativas) {
    if (!tentativa.sucesso) falhasTotais += 1;

    let acc = porIp.get(tentativa.ip);
    if (!acc) {
      acc = { tentativas: 0, falhas: 0, matriculas: new Set(), primeiraEm: tentativa.criadoEm, ultimaEm: tentativa.criadoEm };
      porIp.set(tentativa.ip, acc);
    }
    acc.tentativas += 1;
    if (!tentativa.sucesso) acc.falhas += 1;
    acc.matriculas.add(tentativa.matricula);
    if (tentativa.criadoEm < acc.primeiraEm) acc.primeiraEm = tentativa.criadoEm;
    if (tentativa.criadoEm > acc.ultimaEm) acc.ultimaEm = tentativa.criadoEm;
  }

  const ipsSuspeitos: IpSuspeito[] = [...porIp.entries()]
    .filter(([, acc]) => acc.matriculas.size > LIMIAR_MATRICULAS_DISTINTAS || acc.falhas > LIMIAR_FALHAS)
    .map(([ip, acc]) => ({
      ip,
      tentativas: acc.tentativas,
      matriculasDistintas: acc.matriculas.size,
      primeiraEm: acc.primeiraEm.toISOString(),
      ultimaEm: acc.ultimaEm.toISOString(),
    }))
    .sort((a, b) => b.tentativas - a.tentativas);

  const ipsSuspeitosSet = new Set(ipsSuspeitos.map((linha) => linha.ip));

  let contasBloqueadas: ContaBloqueada[] = colaboradoresBloqueados.map((colaborador) => ({
    colaboradorId: colaborador.id,
    nome: colaborador.nome,
    matricula: colaborador.matricula,
    // Seguro: filtrado por `bloqueadoAte: { gt: agora }` acima, nunca null aqui.
    bloqueadoAte: (colaborador.bloqueadoAte as Date).toISOString(),
    falhas: colaborador.tentativasFalhas,
  }));

  if (filtro.apenasSuspeitas) {
    const matriculasSuspeitas = new Set<string>();
    for (const tentativa of tentativas) {
      if (ipsSuspeitosSet.has(tentativa.ip)) matriculasSuspeitas.add(tentativa.matricula);
    }
    contasBloqueadas = contasBloqueadas.filter((conta) => matriculasSuspeitas.has(conta.matricula));
  }

  const tentativasTotais = tentativas.length;
  return {
    contasBloqueadas,
    ipsSuspeitos,
    sessoesAtivas,
    resumo: {
      tentativas: tentativasTotais,
      falhas: falhasTotais,
      taxaFalha: tentativasTotais > 0 ? falhasTotais / tentativasTotais : 0,
    },
  };
}
