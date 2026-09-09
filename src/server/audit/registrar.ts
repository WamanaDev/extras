/**
 * SEC-AUD — `registrarAuditoria`.
 *
 * Entregável explícito de `specs/02-seguranca/auditoria.md`. Grava uma linha
 * de `audit_log` **dentro da transação da ação que está sendo auditada**
 * (AUD-2) — a assinatura exige `tx`, não existe overload sem transação, então
 * é impossível chamar isso fora de uma transação por acidente.
 *
 * `id` e `criado_em` são gerados aqui, não pelo banco (`DEFAULT`), porque o
 * hash da linha precisa incluí-los e `audit_log` é append-only: não dá para
 * gravar, ler de volta e fazer `UPDATE` com o hash (UPDATE é revogado de
 * `app_server` — AUD-1). O hash tem que estar pronto antes do único `INSERT`.
 *
 * Depende da tabela `audit_log` de `03-banco/modelo-dados.md`, que ainda não
 * existe neste repositório (Onda 1 não começou) — ver o cabeçalho da
 * migration `prisma/migrations/*_sec_aud_audit_log_hash_chain/migration.sql`.
 */
import { randomUUID } from 'node:crypto';
import { redigir } from '@/server/log/redact';
import { calcularHash, GENESIS } from './hash-chain';
import type { ClienteTransacao } from '@/server/db/tx';

export type AtorTipo = 'COLABORADOR' | 'ADMIN' | 'SISTEMA';

/** Eventos auditados — tabela "Eventos auditados" da spec. */
export type AcaoAuditoria =
  | 'LOGIN_SUCESSO'
  | 'LOGIN_FALHA'
  | 'PIN_DEFINIDO'
  | 'PIN_RESETADO'
  | 'SESSAO_REVOGADA'
  /**
   * Logout do próprio colaborador (`04-api/auth/API-AUTH-004-logout.md`,
   * "Fluxo", passo 2 — "Auditar `LOGOUT`"). Não consta na tabela "Eventos
   * auditados" de `02-seguranca/auditoria.md` (que só lista `SESSAO_REVOGADA`,
   * ação do Admin sobre terceiro) — extensão aditiva, mesmo padrão já usado
   * neste arquivo para os demais códigos de `API-AUTH-*`. Ver `_conflitos.md`.
   */
  | 'LOGOUT'
  /**
   * Login administrativo (`API-AUTH-006-admin-login.md`, "Fluxo", passo 3).
   * Extensão aditiva pelo mesmo motivo de `LOGOUT` acima.
   */
  | 'LOGIN_ADMIN_SUCESSO'
  | 'LOGIN_ADMIN_FALHA'
  | 'EXTRA_MARCADA'
  | 'EXTRA_CANCELADA'
  | 'ESCALA_GERADA'
  | 'AUSENCIA_ALTERADA'
  | 'ESCALA_TROCADA'
  | 'LIMITE_ALTERADO'
  | 'CRUZADA_ALTERADA'
  | 'CICLO_PUBLICADO'
  | 'CICLO_FECHADO'
  | 'PLANTAO_CRIADO'
  | 'PLANTAO_ALTERADO'
  | 'PLANTAO_REMOVIDO'
  | 'COLABORADOR_CRIADO'
  | 'COLABORADOR_ALTERADO'
  | 'COLABORADOR_DESATIVADO'
  | 'EXPORTACAO_DADOS'
  | 'AUDITORIA_CONSULTADA'
  /**
   * Cadastro/gestão dinâmica de motivo de ausência (`codigo_escala`,
   * DOM-003) pelo admin — pedido do usuário, sem spec de API própria ainda.
   * Extensão aditiva, mesmo padrão já usado neste arquivo para os demais
   * códigos de `API-AUTH-*`. Ver `_conflitos.md`.
   */
  | 'CODIGO_ESCALA_CRIADO'
  | 'CODIGO_ESCALA_ALTERADO'
  | 'CODIGO_ESCALA_DESATIVADO'
  /**
   * Admin envia notificação manual (in-app + push best-effort) a um ou mais
   * colaboradores (`POST /api/admin/notificacoes`) — pedido do usuário, sem
   * spec de API própria ainda. Extensão aditiva, mesmo padrão de
   * `CODIGO_ESCALA_*` acima. Ver `_conflitos.md`.
   */
  | 'NOTIFICACAO_ENVIADA'
  /**
   * Fluxo de solicitação de cancelamento de extra (colaborador não cancela
   * mais direto — pede, qualquer admin aprova ou recusa) — pedido do
   * usuário, sem spec de API própria ainda. Extensão aditiva, mesmo padrão
   * de `NOTIFICACAO_ENVIADA`/`CODIGO_ESCALA_*` acima. Ver `_conflitos.md`.
   */
  | 'CANCELAMENTO_SOLICITADO'
  | 'CANCELAMENTO_APROVADO'
  | 'CANCELAMENTO_RECUSADO'
  /**
   * Admin convida um novo administrador (`POST /api/admin/administradores`)
   * — pedido do usuário, sem spec de API própria ainda. Extensão aditiva,
   * mesmo padrão de `NOTIFICACAO_ENVIADA`/`CODIGO_ESCALA_*` acima. Ver
   * `_conflitos.md`.
   */
  | 'ADMIN_CONVIDADO';

export interface EventoAuditoria {
  atorTipo: AtorTipo;
  atorId: string | null;
  acao: AcaoAuditoria;
  entidade: string;
  entidadeId: string | null;
  /** Antes/depois em alteração. Nunca PIN/token — redigido antes de gravar. */
  payload: unknown;
  ip: string;
  userAgent: string;
  requestId: string;
}

/**
 * Busca o `hash` da última linha gravada — predecessor da nova linha na
 * cadeia. `null` quando `audit_log` está vazia (linha gênese).
 */
async function buscarUltimoHash(tx: ClienteTransacao): Promise<string | null> {
  const linhas = await tx.$queryRaw<Array<{ hash: string }>>`
    SELECT hash FROM audit_log ORDER BY criado_em DESC, id DESC LIMIT 1
  `;
  return linhas[0]?.hash ?? null;
}

/**
 * Grava uma linha de auditoria. Lança se a gravação falhar — não há caminho
 * silencioso (AUD-3): o `throw` propaga para dentro da transação do chamador,
 * que faz rollback da ação inteira junto com o log.
 */
export async function registrarAuditoria(tx: ClienteTransacao, evento: EventoAuditoria): Promise<{ id: string; hash: string }> {
  const id = randomUUID();
  const criadoEm = new Date().toISOString();
  const hashAnterior = await buscarUltimoHash(tx);
  const payloadRedigido = redigir(evento.payload);
  const payloadTexto = JSON.stringify(payloadRedigido);

  const hash = calcularHash({
    hashAnterior: hashAnterior ?? GENESIS,
    id,
    atorId: evento.atorId,
    acao: evento.acao,
    entidadeId: evento.entidadeId,
    payloadTexto,
    criadoEm,
  });

  await tx.$executeRaw`
    INSERT INTO audit_log (
      id, ator_tipo, ator_id, acao, entidade, entidade_id, payload,
      ip, user_agent, request_id, criado_em, hash_anterior, hash
    ) VALUES (
      ${id}::uuid, ${evento.atorTipo}::ator_tipo, ${evento.atorId}::uuid, ${evento.acao}, ${evento.entidade}, ${evento.entidadeId}::uuid,
      ${payloadTexto}::jsonb,
      ${evento.ip}::inet, ${evento.userAgent}, ${evento.requestId}::uuid, ${criadoEm}::timestamptz,
      ${hashAnterior}, ${hash}
    )
  `;

  return { id, hash };
}
