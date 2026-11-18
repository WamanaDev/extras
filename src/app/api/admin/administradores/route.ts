/**
 * `GET/POST /api/admin/administradores` — lista e convida administradores.
 * Fecha a lacuna documentada em `/admin/configuracoes` ("Administradores são
 * contas do Supabase Auth... nenhuma rota de `04-api/*` expõe CRUD" —
 * pedido do usuário, sem spec própria ainda).
 *
 * Sem tabela própria no Prisma (`FUND-003`) — lê/escreve via Supabase Admin
 * API (`src/server/auth/administradores.ts`). Auditoria ainda vai pro
 * `audit_log` do Prisma normalmente (`registrarAuditoria` só precisa de uma
 * transação, não de FK pra nenhuma linha de admin).
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { erroDeNegocio, erroDeValidacao } from '@/server/http/erros';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { obterPrisma } from '@/server/db/client';
import { obterSupabaseAdmin } from '@/server/auth/supabase-admin';
import { listarAdministradores, convidarAdministrador, ehEmailJaExistente } from '@/server/auth/administradores';

export const GET = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'leitura_por_sessao' },
  cache: 'pessoal',
  handler: async () => {
    const administradores = await listarAdministradores(obterSupabaseAdmin());
    return { itens: administradores };
  },
});

const ConvidarSchema = z.object({
  email: z.string().trim().email('E-mail inválido.'),
  nome: z.string().trim().min(1).max(200).optional(),
});

export const POST = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  body: ConvidarSchema,
  cache: 'mutacao',
  statusSucesso: 201,
  handler: async ({ body, ator, ctx, request }) => {
    // Sem isso, o Supabase manda pro "Site URL" padrão do projeto (achado
    // em uso real — caía em `/login`, tela de colaborador). Ver docstring
    // de `EntradaConvidarAdministrador.redirectTo`.
    const redirectTo = `${new URL(request.url).origin}/admin/definir-senha`;

    let convidado: { id: string; email: string | null };
    try {
      convidado = await convidarAdministrador(obterSupabaseAdmin(), {
        email: body.email,
        redirectTo,
        ...(body.nome !== undefined ? { nome: body.nome } : {}),
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Falha ao convidar administrador.';
      if (ehEmailJaExistente(mensagem)) {
        throw erroDeNegocio('Já existe uma conta com este e-mail.', 'EMAIL_JA_EXISTE');
      }
      throw erroDeValidacao({ email: mensagem });
    }

    const prisma = await obterPrisma();
    await emTransacao(prisma, (tx) =>
      registrarAuditoria(tx, {
        atorTipo: 'ADMIN',
        atorId: ator.adminId,
        acao: 'ADMIN_CONVIDADO',
        entidade: 'admin',
        entidadeId: null,
        payload: { email: body.email },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      }),
    );

    return { administrador: convidado };
  },
});
