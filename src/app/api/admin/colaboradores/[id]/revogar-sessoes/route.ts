/**
 * API-ADM-COL-010 — `POST /api/admin/colaboradores/:id/revogar-sessoes`
 *
 * Encerra todas as sessões ativas de um colaborador — contenção imediata em
 * suspeita de comprometimento ou desligamento (CIA "D" da spec). Efetiva na
 * hora porque toda requisição valida a sessão contra o banco
 * (`resolverSessaoColaborador`, `src/server/http/handler.ts`), não só a
 * assinatura do cookie — se a validação fosse só do JWT, revogar seria
 * impossível antes da expiração (CIA "C").
 *
 * Idempotente por construção: `updateMany` com `revogadaEm: null` na cláusula
 * `where` só afeta sessões ainda ativas — rodar de novo sempre devolve `0`,
 * nunca erro (teste 3 da spec).
 *
 * Lógica em `./_impl.ts` (Next.js só aceita métodos HTTP como export de `route.ts`).
 */
import { obterPrisma } from '@/server/services/colaboradores';
import { criarHandlerRevogarSessoes } from './_impl';

export const POST = criarHandlerRevogarSessoes(obterPrisma());
