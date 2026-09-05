/**
 * `GET`/`POST /api/admin/codigos-escala` — ver doc-comment de `./_impl.ts`.
 *
 * Handlers extraídos pra `_impl.ts` (não exportados daqui) porque o Next.js
 * App Router restringe os exports válidos de um `route.ts` a `GET`/`POST`/...
 * e alguns poucos nomes de configuração — exportar `criarHandlerListar`
 * direto daqui quebra a checagem de tipos gerada (`.next/types`). Mesma
 * técnica de `colaboradores/[id]/revogar-sessoes/route.ts`.
 */
import { criarHandlerListar, criarHandlerCriar } from './_impl';
import { obterPrisma } from '@/server/services/colaboradores';

export const GET = criarHandlerListar(obterPrisma());
export const POST = criarHandlerCriar(obterPrisma());
