/**
 * API-ADM-COL-004 — `POST /api/admin/colaboradores/importar`
 *
 * Lógica em `./_impl.ts` — Next.js só aceita métodos HTTP como export de
 * `route.ts` (ver docstring de `_impl.ts`).
 */
import { obterPrisma } from '@/server/services/colaboradores';
import { criarHandlerImportar } from './_impl';

export const POST = criarHandlerImportar(obterPrisma());
