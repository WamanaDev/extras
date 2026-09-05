/**
 * Singletons de `PrismaClient` para `specs/04-api/admin-relatorios/*`.
 *
 * Mesmo padrão de `src/server/auth/prisma-cliente.ts` (import dinâmico —
 * nenhum teste que injete um `PrismaClient` fake nas funções de
 * `src/server/relatorios/*.ts` precisa de `DATABASE_URL`/cliente gerado
 * disponível no processo; reuso do padrão já estabelecido nesta onda, não
 * duplicação de ideia nova).
 *
 * Dois clientes, não um:
 *
 * - `obterPrismaRelatoriosReadonly` — API-ADM-REL-001 ("D: consulta pesada.
 *   Roda no role `app_readonly`, com `statement_timeout` próprio, para que
 *   um relatório lento nunca compita por conexão com a marcação de extras no
 *   pico"). `app_readonly` só tem `SELECT` (`02-seguranca/confidencialidade.md`,
 *   "Least privilege no banco").
 * - `obterPrismaRelatorios` — usado por `API-ADM-REL-002`/`003`, que também
 *   precisam gravar em `audit_log` (`EXPORTACAO_DADOS`/`AUDITORIA_CONSULTADA`)
 *   via `registrarAuditoria`. `app_readonly` teve `INSERT` em `audit_log`
 *   revogado explicitamente (`prisma/migrations/20260101000009_roles_grants/
 *   migration.sql`: "REVOKE UPDATE, DELETE, INSERT ON audit_log FROM
 *   app_readonly") — a gravação de auditoria dessas duas rotas usa o cliente
 *   normal (role `app_server`), nunca o readonly.
 *
 * GAP registrado em `_conflitos.md`: nenhuma spec de `00-fundacao/04-api`
 * nomeia a variável de ambiente com a connection string autenticada como
 * `app_readonly`, e `src/env.ts` (entregável de outra spec, "alteração exige
 * revisão humana") não a declara. Resolução pragmática, sem tocar `env.ts`:
 * lê `process.env.DATABASE_URL_READONLY` diretamente aqui e cai para
 * `DATABASE_URL` (role `app_server`) quando ausente — a rota funciona sem a
 * variável nova (mesmos dados, mesma resposta), só sem a isolação de role/
 * `statement_timeout` dedicado até alguém provisionar
 * `DATABASE_URL_READONLY` no ambiente.
 */
import type { PrismaClient } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mesmo isolamento de `any` que `src/server/auth/prisma-cliente.ts`/`src/server/http/handler.ts` fazem no bootstrap do client dinâmico.
let prismaEscritaSingleton: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prismaLeituraSingleton: any = null;

/** Cliente de leitura+escrita (role `app_server`) — exportação e consulta de auditoria precisam gravar `audit_log`. */
export async function obterPrismaRelatorios(): Promise<PrismaClient> {
  if (!prismaEscritaSingleton) {
    const { PrismaClient: Ctor } = await import('@prisma/client');
    prismaEscritaSingleton = new Ctor();
  }
  return prismaEscritaSingleton as PrismaClient;
}

/** Cliente só-leitura (role `app_readonly` quando `DATABASE_URL_READONLY` está configurada — ver GAP acima). */
export async function obterPrismaRelatoriosReadonly(): Promise<PrismaClient> {
  if (!prismaLeituraSingleton) {
    const { PrismaClient: Ctor } = await import('@prisma/client');
    // `?? ''` só como último fallback de tipo (`exactOptionalPropertyTypes` não
    // aceita `url: string | undefined` num campo `string`) — em runtime,
    // `DATABASE_URL` é sempre configurada (contrato de ambiente do projeto);
    // string vazia aqui só se both variáveis estiverem ausentes, o que já
    // seria uma falha de configuração antes desta troca.
    const url = process.env.DATABASE_URL_READONLY ?? process.env.DATABASE_URL ?? '';
    prismaLeituraSingleton = new Ctor({ datasources: { db: { url } } });
  }
  return prismaLeituraSingleton as PrismaClient;
}

/** Só para teste: força a recriação dos singletons entre suítes que injetam fakes distintos. */
export function _resetarSingletonsParaTeste(): void {
  prismaEscritaSingleton = null;
  prismaLeituraSingleton = null;
}
