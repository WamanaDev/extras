/**
 * `PATCH`/`DELETE /api/admin/codigos-escala/:id` — ver doc-comment de `./_impl.ts`.
 * Handlers extraídos pra `_impl.ts` pelo mesmo motivo do `route.ts` do diretório pai.
 */
import { criarHandlerAtualizar, criarHandlerDesativar } from './_impl';
import { obterPrisma } from '@/server/services/colaboradores';

export const PATCH = criarHandlerAtualizar(obterPrisma());
export const DELETE = criarHandlerDesativar(obterPrisma());
