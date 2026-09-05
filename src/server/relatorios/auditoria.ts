/**
 * API-ADM-REL-003 — `GET /api/admin/auditoria`.
 *
 * Consulta a trilha de `audit_log` (modelo Prisma `AuditLog`, entregável de
 * `02-seguranca/auditoria.md`/`03-banco/modelo-dados.md`), filtra e pagina, e
 * valida a cadeia de hash de cada evento retornado — reaproveita
 * `calcularHash` de `@/server/audit/hash-chain.ts` (função pura já usada por
 * `validar-cadeia.ts`), sem duplicar a fórmula do hash.
 *
 * ## Fluxo (spec)
 * 1. Filtrar e paginar.
 * 2. Validar a cadeia de hash dos eventos retornados.
 * 3. Auditar `AUDITORIA_CONSULTADA` (AUD-7 — "quem investiga também é
 *    registrado").
 *
 * ## Validação de integridade por evento
 * A spec pede o campo `integridade` por linha, não um veredito da cadeia
 * inteira (isso é o job diário de `validar-cadeia.ts`, AUD-4). Aqui cada
 * linha é recomputada isoladamente — `hash_anterior` da própria linha (já
 * gravado) + os demais campos → deve bater com `hash` (também já gravado).
 * Isso detecta adulteração direta de uma linha (`HASH_RECALCULADO_DIFERENTE`
 * em `hash-chain.ts`) sem precisar carregar a cadeia inteira do banco para
 * responder uma página — o mesmo tipo de checagem, com escopo por linha em
 * vez de por página inteira (a continuidade `hash_anterior` entre linhas
 * consecutivas da cadeia completa é responsabilidade do job diário, AUD-4).
 *
 * ## Payload nunca contém PIN
 * Não há trabalho extra a fazer aqui para o teste #4 ("PIN no payload:
 * ausente") — `registrarAuditoria` (`@/server/audit/registrar.ts`) já redige
 * o payload **antes** de gravar (`SEC-CONF`). Esta consulta só lê de volta o
 * que já foi persistido redigido.
 */
import type { PrismaClient } from '@prisma/client';
import { emTransacao, type ClienteTransacao } from '@/server/db/tx';
import { calcularHash } from '@/server/audit/hash-chain';
import { registrarAuditoria } from '@/server/audit/registrar';

export interface FiltroAuditoria {
  // `| undefined` explícito (não só `?:`) — exigido por `exactOptionalPropertyTypes:
  // true`: `route.ts` monta o objeto a partir de `query.<campo>` (sempre `T |
  // undefined` para campo opcional do Zod), então a chave sempre existe no
  // literal, só o valor pode ser `undefined`. Mesmo padrão de
  // `src/server/services/marcacoes-admin.ts` (`FiltrosListarMarcacoes`).
  entidade?: string | undefined;
  entidadeId?: string | undefined;
  atorId?: string | undefined;
  acao?: string | undefined;
  de?: Date | undefined;
  ate?: Date | undefined;
  pagina: number;
  tamanho: number;
}

export interface EventoAuditoriaSaida {
  id: string;
  criadoEm: string;
  atorTipo: string;
  atorId: string | null;
  atorNome: string | null;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  payload: unknown;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  integridade: 'OK' | 'QUEBRADA';
}

export interface ResultadoAuditoria {
  eventos: EventoAuditoriaSaida[];
  total: number;
}

export interface ContextoConsultaAuditoria {
  atorId: string;
  ip: string;
  userAgent: string;
  requestId: string;
}

interface LinhaAuditLogBruta {
  id: string;
  atorTipo: string;
  atorId: string | null;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  payload: unknown;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  criadoEm: Date;
  hashAnterior: string | null;
  hash: string;
}

function construirWhere(filtro: FiltroAuditoria): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filtro.entidade) where.entidade = filtro.entidade;
  if (filtro.entidadeId) where.entidadeId = filtro.entidadeId;
  if (filtro.atorId) where.atorId = filtro.atorId;
  if (filtro.acao) where.acao = filtro.acao;
  if (filtro.de || filtro.ate) {
    where.criadoEm = {
      ...(filtro.de ? { gte: filtro.de } : {}),
      ...(filtro.ate ? { lte: filtro.ate } : {}),
    };
  }
  return where;
}

function validarIntegridadeLinha(linha: LinhaAuditLogBruta): 'OK' | 'QUEBRADA' {
  const criadoEmIso = linha.criadoEm.toISOString();
  const hashRecalculado = calcularHash({
    hashAnterior: linha.hashAnterior,
    id: linha.id,
    atorId: linha.atorId,
    acao: linha.acao,
    entidadeId: linha.entidadeId,
    payloadTexto: JSON.stringify(linha.payload),
    criadoEm: criadoEmIso,
  });
  return hashRecalculado === linha.hash ? 'OK' : 'QUEBRADA';
}

async function montarEventos(tx: ClienteTransacao, linhas: LinhaAuditLogBruta[]): Promise<EventoAuditoriaSaida[]> {
  const idsColaborador = [...new Set(linhas.filter((l) => l.atorTipo === 'COLABORADOR' && l.atorId).map((l) => l.atorId as string))];
  const colaboradores = idsColaborador.length
    ? await tx.colaborador.findMany({ where: { id: { in: idsColaborador } }, select: { id: true, nome: true } })
    : [];
  const nomesPorId = new Map(colaboradores.map((c) => [c.id, c.nome] as const));

  return linhas.map((linha) => ({
    id: linha.id,
    criadoEm: linha.criadoEm.toISOString(),
    atorTipo: linha.atorTipo,
    atorId: linha.atorId,
    // Nome de admin não é resolvível aqui — não existe tabela local de admin
    // (autenticação via Supabase Auth, `stack.md`). Gap registrado em
    // `_conflitos.md`.
    atorNome: linha.atorTipo === 'COLABORADOR' && linha.atorId ? (nomesPorId.get(linha.atorId) ?? null) : null,
    acao: linha.acao,
    entidade: linha.entidade,
    entidadeId: linha.entidadeId,
    payload: linha.payload,
    ip: linha.ip,
    userAgent: linha.userAgent,
    requestId: linha.requestId,
    integridade: validarIntegridadeLinha(linha),
  }));
}

/**
 * Consulta paginada da trilha (passo 1+2 do fluxo) e grava `AUDITORIA_CONSULTADA`
 * (passo 3, AUD-7) na mesma transação de leitura — mesmo padrão de `ciclo.ts`
 * (`emTransacao`), ainda que aqui a "ação auditada" seja a própria consulta.
 */
export async function consultarAuditoria(
  prisma: PrismaClient,
  filtro: FiltroAuditoria,
  contexto: ContextoConsultaAuditoria,
): Promise<ResultadoAuditoria> {
  return emTransacao(prisma, async (tx) => {
    const where = construirWhere(filtro);
    const [linhas, total] = await Promise.all([
      tx.auditLog.findMany({
        where,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (filtro.pagina - 1) * filtro.tamanho,
        take: filtro.tamanho,
      }) as unknown as Promise<LinhaAuditLogBruta[]>,
      tx.auditLog.count({ where }),
    ]);

    const eventos = await montarEventos(tx, linhas);

    await registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: contexto.atorId,
      acao: 'AUDITORIA_CONSULTADA',
      entidade: 'audit_log',
      entidadeId: null,
      payload: {
        filtro: {
          entidade: filtro.entidade ?? null,
          entidadeId: filtro.entidadeId ?? null,
          atorId: filtro.atorId ?? null,
          acao: filtro.acao ?? null,
          de: filtro.de ? filtro.de.toISOString() : null,
          ate: filtro.ate ? filtro.ate.toISOString() : null,
        },
        resultados: total,
      },
      ip: contexto.ip,
      userAgent: contexto.userAgent,
      requestId: contexto.requestId,
    });

    return { eventos, total };
  });
}
