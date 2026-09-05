/**
 * API-ADM-COL-007 — `POST /api/admin/colaboradores/:id/resetar-pin`
 *
 * O admin nunca define o PIN da pessoa (CIA "C" da spec) — esta rota só zera
 * `pinHash`, forçando o colaborador a definir um novo PIN no próximo acesso
 * (`precisaTrocarPin = true`, mesmo fluxo de `04-api/auth/API-AUTH-003`).
 *
 * Os quatro passos do Fluxo (zerar PIN, revogar sessões, zerar bloqueio,
 * auditar) rodam na mesma transação (ACID/A da spec): resetar o PIN sem
 * revogar as sessões deixaria uma sessão viva autenticada com um PIN que
 * acabou de ser invalidado.
 *
 * Lógica em `./_impl.ts` (Next.js só aceita métodos HTTP como export de `route.ts`).
 */
import { obterPrisma } from '@/server/services/colaboradores';
import { criarHandlerResetarPin } from './_impl';

export const POST = criarHandlerResetarPin(obterPrisma());
