/**
 * Auditoria `LOGIN_ADMIN_SUCESSO` / `LOGIN_ADMIN_FALHA` (`API-AUTH-006`) —
 * compartilhada pela etapa de senha (`/api/auth/admin/login`) e pela de
 * código (`/api/auth/admin/codigo/verificar`).
 */
import type { PrismaClient } from '@prisma/client';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import type { ContextoRequisicao } from '@/server/http/handler';

export async function auditarLoginAdmin(
  prisma: PrismaClient,
  ctx: ContextoRequisicao,
  evento: { sucesso: boolean; email: string; adminId: string | null; motivo?: string },
): Promise<void> {
  await emTransacao(prisma, (tx) =>
    registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: evento.adminId,
      acao: evento.sucesso ? 'LOGIN_ADMIN_SUCESSO' : 'LOGIN_ADMIN_FALHA',
      entidade: 'admin',
      entidadeId: evento.adminId,
      payload: { email: evento.email, ...(evento.motivo ? { motivo: evento.motivo } : {}) },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    }),
  );
}
