/**
 * API-ADM-MAR-001/002/003 — regras de negócio das rotas administrativas de
 * marcações (`src/app/api/admin/marcacoes/*`).
 *
 * Isolado de `route.ts` (que só faz o wiring de `defineHandler` + Zod +
 * Prisma real) para poder ser testado com um `PrismaClient` fake — nenhum
 * teste deste arquivo toca banco de verdade, mesmo padrão de
 * `src/server/http/handler.test.ts` (dependências injetadas).
 *
 * Reaproveita, sem duplicar:
 * - `marcar_extra`/`cancelar_extra` (FN-005/FN-006,
 *   `prisma/migrations/20260101000007_funcoes/migration.sql`) via
 *   `$queryRaw` dentro de `emTransacao` (`SEC-ACID`) — nenhuma regra de
 *   negócio (janela, jornada, limite, vaga, cruzada) é reimplementada aqui.
 * - `saldo_colaborador` (FN-008) para o saldo devolvido por
 *   `API-ADM-MAR-002`/`003`.
 * - `registrarAuditoria` (`SEC-AUD`) dentro da mesma transação (`AUD-2`).
 * - `erroDeExcecaoDeFuncao`, plugado em `traduzirErro`
 *   (`src/server/http/erros.ts`) — os erros que `marcar_extra`/
 *   `cancelar_extra` levantam (`PLANTAO_INDISPONIVEL`, `CICLO_FECHADO`,
 *   `CRUZADA_BLOQUEADA`, `EM_AUSENCIA`, `CONFLITO_DE_HORARIO`,
 *   `EXCEDE_JORNADA`, `LIMITE_ATINGIDO`, `SEM_VAGA`, `MARCACAO_INEXISTENTE`,
 *   ...) chegam aqui como erro de driver e saem de `route.ts` já traduzidos
 *   pelo pipeline de `defineHandler` — este módulo nunca precisa capturá-los
 *   individualmente, só deixa propagar.
 *
 * `_conflitos.md`, item 12: a listagem (`API-ADM-MAR-001`) pede
 * `canceladoPor` no payload, mas `marcacao` (schema real) não tem essa
 * coluna — só `cancelado_em`. Resolvido lendo o `ator_id` do evento
 * `EXTRA_CANCELADA` mais recente em `audit_log` para cada marcação
 * cancelada da página (`buscarCanceladoPorPorMarcacao` abaixo).
 *
 * `marcarExtraAdmin` com `novoPlantao` (pedido do usuário, ver `_conflitos.md`):
 * cria um plantão de 1 vaga exclusivo pra esta marcação, reaproveitando
 * `criarPlantao` (`API-ADM-PLA-001`, `@/server/plantoes/criar`) — mesma
 * transação de `marcar_extra`/`registrarAuditoria` já usada abaixo, não uma
 * transação própria: se `marcar_extra` rejeitar depois (`EM_AUSENCIA`,
 * `EXCEDE_JORNADA`, etc.), o `ROLLBACK` desfaz a criação do plantão junto —
 * nunca sobra um plantão vazio órfão por causa de uma marcação que não deu
 * certo (mesma garantia de "A" de ACID que todo o resto deste arquivo já
 * segue).
 */
import type { PrismaClient } from '@prisma/client';
import type { Turno } from '@prisma/client';
import type { ClienteTransacao } from '@/server/db/tx';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { erroInterno } from '@/server/http/erros';
import { criarPlantao } from '@/server/plantoes/criar';

/** Cliente de transação real ou fake injetado em teste — só os métodos usados aqui. */
export type ClienteBanco = Pick<PrismaClient, '$transaction'>;

// ----------------------------------------------------------------------------
// Listar (API-ADM-MAR-001)
// ----------------------------------------------------------------------------

export interface FiltrosListarMarcacoes {
  // `| undefined` explícito em cada campo opcional (não só `?:`) — exigido
  // por `exactOptionalPropertyTypes: true` (`tsconfig.json`): o chamador
  // (`route.ts`) monta o objeto a partir de `query.<campo>`, que é sempre
  // `T | undefined` (saída do Zod para campo opcional), então a chave
  // sempre existe no objeto literal, só o valor pode ser `undefined` —
  // sem o `| undefined` aqui isso é erro de tipo, não presença de chave.
  cicloId?: string | undefined;
  rt?: string | undefined;
  colaboradorId?: string | undefined;
  status?: 'CONFIRMADA' | 'CANCELADA' | undefined;
  cruzada?: boolean | undefined;
  de?: string | undefined;
  ate?: string | undefined;
  pagina: number;
  tamanho: number;
}

export interface MarcacaoListada {
  id: string;
  colaborador: { id: string; nome: string; matricula: string; rt: string };
  plantao: { id: string; data: string; tipo: string; rt: string; horaInicio: string; horaFim: string };
  status: string;
  cruzada: boolean;
  origem: string;
  criadoEm: string;
  canceladoEm: string | null;
  canceladoPor: string | null;
}

export interface TotaisMarcacoes {
  confirmadas: number;
  canceladas: number;
  horas: number;
  cruzadas: number;
}

export interface RespostaListarMarcacoes {
  marcacoes: MarcacaoListada[];
  totais: TotaisMarcacoes;
  /** Total de linhas (sem paginação) — `route.ts` usa para `X-Total-Count` via `paginacao: true` de `defineHandler`. */
  total: number;
}

interface LinhaMarcacaoBruta {
  id: string;
  status: string;
  cruzada: boolean;
  origem: string;
  criadoEm: Date;
  canceladoEm: Date | null;
  colaborador: { id: string; nome: string; matricula: string; rt: { nome: string } };
  plantao: { id: string; data: Date; tipo: string; horaInicio: Date; horaFim: Date; cargaHoras: number; rt: { nome: string } };
}

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function formatarHora(hora: Date): string {
  return hora.toISOString().slice(11, 19);
}

/**
 * Busca, dentro da mesma transação de leitura, o `ator_id` do evento
 * `EXTRA_CANCELADA` mais recente de cada marcação da página (resolução do
 * item 12 de `_conflitos.md` — `marcacao` não tem coluna `cancelado_por`).
 * `undefined`/vazio quando a lista não tem nenhuma marcação cancelada.
 */
async function buscarCanceladoPorPorMarcacao(tx: ClienteTransacao, marcacaoIds: string[]): Promise<Map<string, string | null>> {
  if (marcacaoIds.length === 0) return new Map();
  const linhas = await tx.$queryRaw<Array<{ entidade_id: string; ator_id: string | null }>>`
    SELECT DISTINCT ON (entidade_id) entidade_id, ator_id
      FROM audit_log
     WHERE acao = 'EXTRA_CANCELADA' AND entidade_id = ANY(${marcacaoIds}::uuid[])
     ORDER BY entidade_id, criado_em DESC
  `;
  return new Map(linhas.map((linha) => [linha.entidade_id, linha.ator_id]));
}

export async function listarMarcacoesAdmin(prisma: ClienteBanco, filtros: FiltrosListarMarcacoes): Promise<RespostaListarMarcacoes> {
  return emTransacao(prisma as PrismaClient, async (tx) => {
    const filtroData: { gte?: Date; lte?: Date } = {};
    if (filtros.de) filtroData.gte = new Date(filtros.de);
    if (filtros.ate) filtroData.lte = new Date(filtros.ate);

    const filtroPlantao: { cicloId?: string; rtId?: string; data?: { gte?: Date; lte?: Date } } = {};
    if (filtros.cicloId) filtroPlantao.cicloId = filtros.cicloId;
    if (filtros.rt) filtroPlantao.rtId = filtros.rt;
    if (Object.keys(filtroData).length > 0) filtroPlantao.data = filtroData;

    const where = {
      ...(filtros.colaboradorId ? { colaboradorId: filtros.colaboradorId } : {}),
      ...(filtros.status ? { status: filtros.status } : {}),
      ...(filtros.cruzada !== undefined ? { cruzada: filtros.cruzada } : {}),
      ...(Object.keys(filtroPlantao).length > 0 ? { plantao: filtroPlantao } : {}),
    };

    const [linhas, total, confirmadas, canceladas, cruzadas, horasAgregadas] = await Promise.all([
      tx.marcacao.findMany({
        where,
        include: {
          colaborador: { select: { id: true, nome: true, matricula: true, rt: { select: { nome: true } } } },
          plantao: { select: { id: true, data: true, tipo: true, horaInicio: true, horaFim: true, cargaHoras: true, rt: { select: { nome: true } } } },
        },
        orderBy: { criadoEm: 'desc' },
        skip: (filtros.pagina - 1) * filtros.tamanho,
        take: filtros.tamanho,
      }) as unknown as Promise<LinhaMarcacaoBruta[]>,
      tx.marcacao.count({ where }),
      tx.marcacao.count({ where: { ...where, status: 'CONFIRMADA' } }),
      tx.marcacao.count({ where: { ...where, status: 'CANCELADA' } }),
      tx.marcacao.count({ where: { ...where, cruzada: true } }),
      tx.marcacao.findMany({
        where: { ...where, status: 'CONFIRMADA' },
        select: { plantao: { select: { cargaHoras: true } } },
      }) as unknown as Promise<Array<{ plantao: { cargaHoras: number } }>>,
    ]);

    const canceladoPorPorId = await buscarCanceladoPorPorMarcacao(
      tx,
      linhas.filter((linha) => linha.status === 'CANCELADA').map((linha) => linha.id),
    );

    const marcacoes: MarcacaoListada[] = linhas.map((linha) => ({
      id: linha.id,
      colaborador: {
        id: linha.colaborador.id,
        nome: linha.colaborador.nome,
        matricula: linha.colaborador.matricula,
        rt: linha.colaborador.rt.nome,
      },
      plantao: {
        id: linha.plantao.id,
        data: formatarData(linha.plantao.data),
        tipo: linha.plantao.tipo,
        rt: linha.plantao.rt.nome,
        horaInicio: formatarHora(linha.plantao.horaInicio),
        horaFim: formatarHora(linha.plantao.horaFim),
      },
      status: linha.status,
      cruzada: linha.cruzada,
      origem: linha.origem,
      criadoEm: linha.criadoEm.toISOString(),
      canceladoEm: linha.canceladoEm ? linha.canceladoEm.toISOString() : null,
      canceladoPor: linha.status === 'CANCELADA' ? (canceladoPorPorId.get(linha.id) ?? null) : null,
    }));

    const horas = horasAgregadas.reduce((soma, linha) => soma + linha.plantao.cargaHoras, 0);

    return {
      marcacoes,
      totais: { confirmadas, canceladas, horas, cruzadas },
      total,
    };
  });
}

// ----------------------------------------------------------------------------
// Marcar (API-ADM-MAR-002)
// ----------------------------------------------------------------------------

/** Dados de um plantão novo, criado exclusivamente para esta marcação (pedido do usuário) — sempre `vagasTotais: 1`, nunca reaproveitável por outra marcação. */
export interface NovoPlantaoParaMarcacao {
  cicloId: string;
  rtId: string;
  data: Date;
  tipo: Turno;
  horaInicio?: string | undefined;
  horaFim?: string | undefined;
  permiteCruzada: boolean | null;
}

export interface MarcarExtraAdminParams {
  /** Exatamente um entre `plantaoId` (plantão existente) e `novoPlantao` (cria na mesma transação) — validado em `route.ts`. */
  plantaoId?: string | undefined;
  novoPlantao?: NovoPlantaoParaMarcacao | undefined;
  colaboradorId: string;
  motivo: string;
  adminId: string;
  ip: string;
  userAgent: string;
  requestId: string;
}

export interface RespostaMarcarExtraAdmin {
  id: string;
  plantaoId: string;
  data: string;
  tipo: string;
  rt: string;
  cruzada: boolean;
  saldo: { limite: number; usadas: number; restantes: number };
  origem: 'ADMIN';
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

export async function marcarExtraAdmin(prisma: ClienteBanco, params: MarcarExtraAdminParams): Promise<RespostaMarcarExtraAdmin> {
  return emTransacao(prisma as PrismaClient, async (tx) => {
    // 0. `novoPlantao` (pedido do usuário): cria o plantão exclusivo pra esta
    // marcação ANTES de chamar marcar_extra, na mesma transação — reaproveita
    // `criarPlantao` (API-ADM-PLA-001) sem duplicar suas regras (CICLO_FECHADO,
    // DATA_FORA_DO_CICLO, PLANTAO_JA_EXISTE). `vagasTotais: 1` sempre — o
    // plantão nasce pra esta pessoa, não é uma vaga extra pra outros pegarem.
    // Se marcar_extra rejeitar mais abaixo, o ROLLBACK desfaz a criação junto.
    let plantaoId: string;
    if (params.novoPlantao) {
      const novoPlantao = params.novoPlantao;
      const plantaoCriado = await criarPlantao(
        tx,
        {
          cicloId: novoPlantao.cicloId,
          rtId: novoPlantao.rtId,
          data: novoPlantao.data,
          tipo: novoPlantao.tipo,
          horaInicio: novoPlantao.horaInicio,
          horaFim: novoPlantao.horaFim,
          vagasTotais: 1,
          permiteCruzada: novoPlantao.permiteCruzada,
          observacao: 'Criado exclusivamente para esta marcação manual (admin).',
        },
        { atorId: params.adminId, ip: params.ip, userAgent: params.userAgent, requestId: params.requestId },
      );
      plantaoId = plantaoCriado.id;
    } else if (params.plantaoId) {
      plantaoId = params.plantaoId;
    } else {
      throw erroInterno(new Error('marcarExtraAdmin: nem plantaoId nem novoPlantao foram informados.'));
    }

    // 1. marcar_extra (FN-005), origem ADMIN — pula só a checagem de janela
    // (RN-27), toda outra regra continua valendo dentro da função (SEC-ACID:
    // advisory lock + FOR UPDATE, nenhum atalho de aplicação).
    const linhasMarcacao = await tx.$queryRaw<LinhaMarcarExtra[]>`
      SELECT id, cruzada FROM marcar_extra(
        ${plantaoId}::uuid, ${params.colaboradorId}::uuid,
        'ADMIN'::origem_marcacao, ${params.ip}, ${params.userAgent}
      )
    `;
    const marcacao = linhasMarcacao[0];
    if (!marcacao) throw erroInterno(new Error('marcar_extra não retornou linha'));

    // 2. `motivo` obrigatório (API-ADM-MAR-002, "R"): marcar_extra não tem
    // parâmetro para isso (assinatura travada por 008_rls — `_conflitos.md`
    // item 6) — gravado pelo chamador na mesma transação, coluna já
    // modelada em `marcacao.motivo` para este uso.
    await tx.$executeRaw`UPDATE marcacao SET motivo = ${params.motivo} WHERE id = ${marcacao.id}::uuid`;

    const plantao = await tx.plantao.findUniqueOrThrow({
      where: { id: plantaoId },
      select: { id: true, data: true, tipo: true, cicloId: true, rt: { select: { nome: true } } },
    });

    const linhasSaldo = await tx.$queryRaw<LinhaSaldo[]>`
      SELECT limite, usadas, restantes FROM saldo_colaborador(${plantao.cicloId}::uuid, ${params.colaboradorId}::uuid)
    `;
    const saldo = linhasSaldo[0] ?? { limite: 0, usadas: 0, restantes: 0 };

    // 3. Auditoria dentro da mesma transação (AUD-2) — ator = admin, motivo
    // presente (API-ADM-MAR-002, teste 8).
    await registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: params.adminId,
      acao: 'EXTRA_MARCADA',
      entidade: 'marcacao',
      entidadeId: marcacao.id,
      payload: {
        origem: 'ADMIN',
        motivo: params.motivo,
        plantaoId,
        colaboradorId: params.colaboradorId,
        plantaoCriadoParaEstaMarcacao: params.novoPlantao !== undefined,
      },
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
      origem: 'ADMIN',
    };
  });
}

// ----------------------------------------------------------------------------
// Cancelar (API-ADM-MAR-003)
// ----------------------------------------------------------------------------

export interface CancelarExtraAdminParams {
  marcacaoId: string;
  motivo: string;
  adminId: string;
  ip: string;
  userAgent: string;
  requestId: string;
}

export interface RespostaCancelarExtraAdmin {
  id: string;
  status: 'CANCELADA';
  saldoColaborador: {
    limite: number;
    usadas: number;
    restantes: number;
    permiteCruzada: boolean;
    bloqueado: boolean;
    motivoBloqueio: string | null;
  };
}

interface LinhaCancelarExtra {
  id: string;
  status: string;
  plantaoId: string;
  colaboradorId: string;
}

interface LinhaSaldoCompleto {
  limite: number;
  usadas: number;
  restantes: number;
  permite_cruzada: boolean;
  bloqueado: boolean;
  motivo_bloqueio: string | null;
}

export async function cancelarExtraAdmin(prisma: ClienteBanco, params: CancelarExtraAdminParams): Promise<RespostaCancelarExtraAdmin> {
  return emTransacao(prisma as PrismaClient, async (tx) => {
    // cancelar_extra (FN-006), ator ADMIN — bloqueia só ciclo FECHADO
    // (RN-25); janela é ignorada para admin dentro da própria função.
    // Idempotente: chamada duas vezes na mesma marcação já CANCELADA não
    // decrementa contador de novo, devolve a linha como está (FN-006).
    const linhas = await tx.$queryRaw<LinhaCancelarExtra[]>`
      SELECT id, status, plantao_id AS "plantaoId", colaborador_id AS "colaboradorId"
        FROM cancelar_extra(${params.marcacaoId}::uuid, ${params.adminId}::uuid, 'ADMIN')
    `;
    const marcacao = linhas[0];
    if (!marcacao) throw erroInterno(new Error('cancelar_extra não retornou linha'));

    const plantao = await tx.plantao.findUniqueOrThrow({ where: { id: marcacao.plantaoId }, select: { cicloId: true } });
    const linhasSaldo = await tx.$queryRaw<LinhaSaldoCompleto[]>`
      SELECT limite, usadas, restantes, permite_cruzada, bloqueado, motivo_bloqueio
        FROM saldo_colaborador(${plantao.cicloId}::uuid, ${marcacao.colaboradorId}::uuid)
    `;
    const saldo = linhasSaldo[0] ?? {
      limite: 0,
      usadas: 0,
      restantes: 0,
      permite_cruzada: false,
      bloqueado: false,
      motivo_bloqueio: null,
    };

    // Auditoria dentro da mesma transação (AUD-2) — ator = admin, motivo
    // presente (API-ADM-MAR-003, teste 6). Sempre gravada, mesmo em chamada
    // idempotente (segunda vez): é um novo evento de auditoria de tentativa
    // administrativa, não uma segunda mutação de estado.
    await registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: params.adminId,
      acao: 'EXTRA_CANCELADA',
      entidade: 'marcacao',
      entidadeId: marcacao.id,
      payload: { motivo: params.motivo },
      ip: params.ip,
      userAgent: params.userAgent,
      requestId: params.requestId,
    });

    return {
      id: marcacao.id,
      status: 'CANCELADA',
      saldoColaborador: {
        limite: saldo.limite,
        usadas: saldo.usadas,
        restantes: saldo.restantes,
        permiteCruzada: saldo.permite_cruzada,
        bloqueado: saldo.bloqueado,
        motivoBloqueio: saldo.motivo_bloqueio,
      },
    };
  });
}
