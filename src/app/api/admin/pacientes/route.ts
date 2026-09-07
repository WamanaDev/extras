/**
 * API-ADM-PAC-001 (`GET`) / API-ADM-PAC-002 (`POST`) — `/api/admin/pacientes`.
 */
import { z, type ZodSchema } from 'zod';
import { defineHandler, paginacaoQuerySchema } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { listarPacientesAdmin, criarPaciente } from '@/server/services/pacientes/pacientes';

const ListarQuerySchema = z
  .object({
    rtId: z.string().uuid().optional(),
    status: z.enum(['ATIVO', 'INATIVO']).optional(),
    busca: z.string().trim().min(1).optional(),
  })
  .merge(paginacaoQuerySchema);

type ListarQuerySaida = z.infer<typeof ListarQuerySchema>;

export const GET = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'leitura_por_sessao' },
  // Ver mesmo cast em `admin/marcacoes/route.ts` — `pagina`/`tamanho` têm
  // `.default()` (entrada opcional, saída obrigatória), então `Input !==
  // Output` e `ZodSchema<TQuery>` (que fixa os dois iguais) não infere o
  // tipo de saída sozinho.
  query: ListarQuerySchema as unknown as ZodSchema<ListarQuerySaida>,
  cache: 'pessoal',
  paginacao: true,
  handler: async ({ query }) => {
    const prisma = await obterPrisma();
    return listarPacientesAdmin(prisma, query);
  },
});

const CriarPacienteSchema = z
  .object({
    nome: z.string().trim().min(1),
    dataNascimento: z.string().date(),
    rtId: z.string().uuid(),
    cpf: z.string().trim().optional(),
    nomeResponsavel: z.string().trim().optional(),
    contatoResponsavel: z.string().trim().optional(),
    observacoesClinicas: z.string().trim().optional(),
  })
  .strict();

export const POST = defineHandler({
  ator: 'ADMIN',
  body: CriarPacienteSchema,
  statusSucesso: 201,
  handler: async ({ body, ator, ctx }) => {
    const prisma = await obterPrisma();
    return criarPaciente(prisma, body, ator.adminId, ctx);
  },
});
