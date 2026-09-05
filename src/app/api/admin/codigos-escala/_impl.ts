/**
 * `GET /api/admin/codigos-escala` — lista de códigos de escala, para
 * preencher seletores (ex.: lançar ausência em lote) e para a tela de
 * gestão de códigos.
 * `POST /api/admin/codigos-escala` — cadastra um novo código.
 *
 * Mesmo gap de `_conflitos.md` que `/api/admin/rts`: `contrato-comum.md`
 * já anuncia "Referência (RTs, códigos)" na tabela de cache, mas nenhuma
 * spec de `04-api/*` chegou a definir estas rotas — sem elas não havia
 * como o admin cadastrar um "motivo de ausência" novo sem migration.
 *
 * DOM-003.6 (revisado a pedido do usuário — ver `_conflitos.md`): D, F e FE
 * são fixos/`bloqueado`. Todo código criado por aqui nasce com
 * `bloqueado: false` — não existe campo no corpo pra isso, e não há rota
 * nenhuma que altere essa coluna depois de criada (só a migration/seed).
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { defineHandler } from '@/server/http/handler';
import { erroDeNegocio } from '@/server/http/erros';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';

const ListarQuerySchema = z.object({
  /** Por padrão só ativos (uso em seletores). `true` traz também os desativados — uso da tela de gestão. */
  todos: z.enum(['true', 'false']).optional(),
});

const CriarCodigoSchema = z
  .object({
    codigo: z
      .string()
      .trim()
      .min(1)
      .max(8)
      .regex(/^[A-Za-z0-9]+$/, 'Use só letras e números.')
      .transform((valor) => valor.toUpperCase()),
    descricao: z.string().trim().min(1).max(80),
    presenca: z.boolean(),
    ocupaHorario: z.boolean(),
    remunerada: z.boolean(),
    cor: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve ser hexadecimal, ex.: #2E7D32.'),
  })
  .strict();

export function criarHandlerListar(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    cache: 'referencia',
    query: ListarQuerySchema,
    handler: async ({ query }) => {
      const codigos = await prisma.codigoEscala.findMany({
        where: query.todos === 'true' ? {} : { ativo: true },
        orderBy: { codigo: 'asc' },
        select: { id: true, codigo: true, descricao: true, presenca: true, ocupaHorario: true, remunerada: true, ativo: true, bloqueado: true, cor: true },
      });
      return { itens: codigos };
    },
  });
}

export function criarHandlerCriar(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    body: CriarCodigoSchema,
    handler: async ({ body, ator, ctx }) => {
      const existente = await prisma.codigoEscala.findFirst({ where: { codigo: body.codigo } });
      if (existente) throw erroDeNegocio(`Já existe um código "${body.codigo}" cadastrado.`, 'REGRA_DE_NEGOCIO');

      const criado = await emTransacao(prisma, async (tx) => {
        const codigo = await tx.codigoEscala.create({
          data: {
            codigo: body.codigo,
            descricao: body.descricao,
            presenca: body.presenca,
            ocupaHorario: body.ocupaHorario,
            remunerada: body.remunerada,
            cor: body.cor,
            ativo: true,
            bloqueado: false, // todo código criado pelo admin nasce não-bloqueado — DOM-003.6.
          },
        });

        await registrarAuditoria(tx, {
          atorTipo: 'ADMIN',
          atorId: ator.adminId,
          acao: 'CODIGO_ESCALA_CRIADO',
          entidade: 'codigo_escala',
          entidadeId: codigo.id,
          payload: { codigo: codigo.codigo, descricao: codigo.descricao },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        });

        return codigo;
      });

      return criado;
    },
  });
}

