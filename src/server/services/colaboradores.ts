/**
 * API-ADM-COL-* — Helpers compartilhados pelas rotas de
 * `src/app/api/admin/colaboradores/**`.
 *
 * Escopo restrito a `specs/04-api/admin-colaboradores/*` (Onda 2). Reaproveita
 * infraestrutura comum já entregue em vez de duplicar:
 * - `@/server/db/tx` (`emTransacao`, `travarColaborador`) — SEC-ACID.
 * - `@/server/audit/registrar` (`registrarAuditoria`) — SEC-AUD, AUD-2.
 * - `@/lib/escala/ancora` (`previewMeses`) — DOM-001, mesma lógica de preview
 *   que a UI e `FN-002` usam; não reimplementada aqui.
 *
 * `obterPrisma()` é um singleton **local a este domínio** — nenhum módulo de
 * cliente Prisma compartilhado existe ainda em `src/server/db/` (só
 * `tx.ts`/`erros.ts`, que recebem o client já pronto). Criar um módulo de
 * client verdadeiramente compartilhado é decisão de infraestrutura que toca
 * as outras 8 pastas de `04-api/*` rodando em paralelo nesta onda — fora do
 * escopo deste agente (só `admin-colaboradores/*`). Mantido próximo do
 * padrão já usado em `src/server/http/handler.ts`
 * (`obterPrismaSingleton`), sem reexportar/alterar aquele módulo.
 */
import { PrismaClient } from '@prisma/client';

let prismaSingleton: PrismaClient | null = null;

/** Singleton do Prisma Client para as rotas de `admin/colaboradores/*`. */
export function obterPrisma(): PrismaClient {
  prismaSingleton ??= new PrismaClient();
  return prismaSingleton;
}

// ----------------------------------------------------------------------------
// Data — `YYYY-MM-DD` (CONVENTIONS.md, "Datas na API")
// ----------------------------------------------------------------------------

const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Interpreta `YYYY-MM-DD` como data civil UTC (evita deslocamento de fuso do processo Node). */
export function parseDataCivil(valor: string): Date | null {
  if (!PADRAO_DATA.test(valor)) return null;
  const [anoStr, mesStr, diaStr] = valor.split('-');
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  const dia = Number(diaStr);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return data;
}

export function formatarDataCivil(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}
