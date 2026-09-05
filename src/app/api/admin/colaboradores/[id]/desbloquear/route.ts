/**
 * API-ADM-COL-008 — `POST /api/admin/colaboradores/:id/desbloquear`
 *
 * Libera uma conta bloqueada por excesso de tentativas de login antes do
 * prazo automático de 15 min (`SEC-DISP`, D2 — o bloqueio expira sozinho;
 * esta rota é conveniência, nunca a única saída). Devolve as últimas 10
 * tentativas de login (`tentativa_login`, com IP e motivo) para o admin
 * decidir se o padrão é "esqueci o PIN" (poucos IPs) ou ataque real (IPs
 * variados) — nesse segundo caso o Fluxo correto é resetar o PIN
 * (`API-ADM-COL-007`), não só desbloquear.
 *
 * `CONTA_DESBLOQUEADA` (nome literal da spec) não existe no catálogo fechado
 * `AcaoAuditoria` (`specs/02-seguranca/auditoria.md`, "Eventos auditados" —
 * só lista `COLABORADOR_CRIADO`/`ALTERADO`/`DESATIVADO` para o agregado
 * `colaborador`). Mesma situação e mesma resolução já usada em
 * `buscar/route.ts` (`BUSCA_POR_MATRICULA`) e `importar/route.ts`
 * (`COLABORADOR_IMPORTADO_LOTE`): reaproveita `COLABORADOR_ALTERADO` (o
 * evento mais próximo — desbloqueio é uma mudança de estado da conta) e
 * registra o nome específico em `payload.acaoEspecifica`, sem inventar um
 * valor novo fora do enum. Ver `_conflitos.md`.
 *
 * Lógica em `./_impl.ts` — Next.js só aceita métodos HTTP como export de
 * `route.ts` (ver docstring de `_impl.ts`).
 */
import { obterPrisma } from '@/server/services/colaboradores';
import { criarHandlerDesbloquear } from './_impl';

export const POST = criarHandlerDesbloquear(obterPrisma());
