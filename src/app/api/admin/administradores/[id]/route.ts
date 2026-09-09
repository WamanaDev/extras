/**
 * `DELETE /api/admin/administradores/:id` — revoga um administrador (conta
 * ativa ou convite pendente ainda não aceito — mesma operação, ver
 * docstring de `revogarAdministrador`).
 *
 * Única regra de negócio própria: **um admin nunca revoga a própria
 * conta** por aqui (evita autobloqueio — se fosse o único admin restante,
 * ninguém mais teria acesso ao painel). Como a conta de quem chama nunca é
 * um alvo válido, sobra sempre pelo menos um admin (o próprio ator) depois
 * de qualquer revogação — não precisa de uma checagem extra de "é o
 * último admin".
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { erroDeNegocio, erroNaoEncontrado } from '@/server/http/erros';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { obterPrisma } from '@/server/db/client';
import { obterSupabaseAdmin } from '@/server/auth/supabase-admin';
import { revogarAdministrador } from '@/server/auth/administradores';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const DELETE = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  params: ParamsSchema,
  cache: 'mutacao',
  handler: async ({ params, ator, ctx }) => {
    if (params.id === ator.adminId) {
      throw erroDeNegocio('Você não pode revogar a própria conta.', 'NAO_PODE_REVOGAR_A_SI_MESMO');
    }

    try {
      await revogarAdministrador(obterSupabaseAdmin(), params.id);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Falha ao revogar administrador.';
      if (/not.?found/i.test(mensagem)) {
        throw erroNaoEncontrado('Administrador não encontrado.');
      }
      throw erro;
    }

    const prisma = await obterPrisma();
    await emTransacao(prisma, (tx) =>
      registrarAuditoria(tx, {
        atorTipo: 'ADMIN',
        atorId: ator.adminId,
        acao: 'ADMIN_REVOGADO',
        entidade: 'admin',
        entidadeId: params.id,
        payload: {},
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      }),
    );

    return { id: params.id };
  },
});
