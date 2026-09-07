/**
 * `GET /api/medicamentos` (busca no catálogo, qualquer ator autenticado) /
 * `POST /api/admin/medicamentos`... na verdade catálogo é criado por
 * qualquer colaborador também (mesmo racional de `RNP-13`: quem lança a
 * receita pode precisar cadastrar o medicamento na hora). Gap não coberto
 * por uma spec de rota própria (`04-api/medicamentos/*` só definiu prescrição
 * e checagem dupla) — utilitário mínimo para `<FormPrescricao />` funcionar,
 * mesmo racional de referência de `codigo_escala`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { listarMedicamentos, criarMedicamento } from '@/server/services/pacientes/medicamentos';

const ListarQuerySchema = z.object({ busca: z.string().trim().min(1).optional() });

export const GET = defineHandler({
  ator: 'QUALQUER',
  rateLimit: { escopo: 'leitura_por_sessao' },
  query: ListarQuerySchema,
  cache: 'referencia',
  handler: async ({ query }) => {
    const prisma = await obterPrisma();
    return listarMedicamentos(prisma, query.busca);
  },
});

const CriarSchema = z.object({ nome: z.string().trim().min(1), principioAtivo: z.string().trim().optional() }).strict();

export const POST = defineHandler({
  ator: 'QUALQUER',
  body: CriarSchema,
  statusSucesso: 201,
  handler: async ({ body }) => {
    const prisma = await obterPrisma();
    return criarMedicamento(prisma, body.nome, body.principioAtivo);
  },
});
