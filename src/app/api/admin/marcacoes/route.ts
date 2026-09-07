/**
 * API-ADM-MAR-001 (`GET`) / API-ADM-MAR-002 (`POST`) — `/api/admin/marcacoes`.
 *
 * Só faz o wiring de `defineHandler` (`contrato-comum.md`) sobre a lógica de
 * negócio de `@/server/services/marcacoes-admin` — nenhuma regra aqui, só
 * validação Zod, mapeamento de query/body e o `PrismaClient` real
 * (`@/server/db/client`, singleton já reaproveitado por outras rotas de
 * `04-api/*` — não recriado).
 */
import { z, type ZodSchema } from 'zod';
import { defineHandler, paginacaoQuerySchema } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { HORA_REGEX } from '@/server/plantoes/util';
import { listarMarcacoesAdmin, marcarExtraAdmin } from '@/server/services/marcacoes-admin';

// ----------------------------------------------------------------------------
// GET — API-ADM-MAR-001
// ----------------------------------------------------------------------------

const ListarQuerySchema = z
  .object({
    cicloId: z.string().uuid().optional(),
    rt: z.string().uuid().optional(),
    colaboradorId: z.string().uuid().optional(),
    status: z.enum(['CONFIRMADA', 'CANCELADA']).optional(),
    // `?cruzada=true|false` — z.coerce.boolean() trataria qualquer string não
    // vazia (inclusive "false") como true; aqui só os dois literais viram
    // boolean, qualquer outro valor é rejeitado pela validação (422).
    cruzada: z
      .enum(['true', 'false'])
      .optional()
      .transform((valor) => (valor === undefined ? undefined : valor === 'true')),
    de: z.string().date().optional(),
    ate: z.string().date().optional(),
  })
  .merge(paginacaoQuerySchema);

type ListarQuerySaida = z.infer<typeof ListarQuerySchema>;

export const GET = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'leitura_por_sessao' },
  // `defineHandler` tipa `query?: ZodSchema<TQuery>` — `ZodSchema<T>` (alias
  // de `ZodType<T>`) fixa `Input = Output = T` por padrão. `ListarQuerySchema`
  // tem `pagina`/`tamanho` com `.default()` (entrada opcional, saída
  // obrigatória) e `cruzada` com `.transform()` (entrada `'true'|'false'`,
  // saída `boolean`) — Input real diverge de Output em ambos, então nenhuma
  // atribuição direta a `ZodSchema<TQuery>` satisfaz o checador sob
  // `exactOptionalPropertyTypes` (mesma classe de erro em
  // `admin/colaboradores/route.ts`/`admin/plantoes*` — não introduzido por
  // esta rota). Cast local para o tipo de *saída*: em runtime
  // `schema.safeParse` não usa o parâmetro `Input` do tipo, só a
  // implementação do schema — este cast não muda comportamento, só alinha o
  // que o TS vê com o que o Zod realmente faz. Corrigir a raiz (tipar
  // `query`/`body`/`params` como `ZodType<TQuery, ZodTypeDef, any>` em
  // `handler.ts`) afetaria todo `04-api/*` de uma vez — fora do escopo desta
  // rodada; ver `_conflitos.md`, item 13.
  query: ListarQuerySchema as unknown as ZodSchema<ListarQuerySaida>,
  // Dado pessoal (marcações) — `contrato-comum.md`, tabela "Cache": nunca
  // cache compartilhado, sempre `private, no-store` para resposta que varia
  // por ator/filtro.
  cache: 'pessoal',
  handler: async ({ query }) => {
    const prisma = await obterPrisma();
    const resultado = await listarMarcacoesAdmin(prisma, {
      cicloId: query.cicloId,
      rt: query.rt,
      colaboradorId: query.colaboradorId,
      status: query.status,
      cruzada: query.cruzada,
      de: query.de,
      ate: query.ate,
      pagina: query.pagina,
      tamanho: query.tamanho,
    });
    // Resposta literal de API-ADM-MAR-001: `{ marcacoes, totais }`, sem o
    // envelope genérico `{ itens, total }` de `paginacao: true` — a spec
    // publica o corpo exato, então `X-Total-Count` (contrato-comum.md,
    // "Paginação") não se aplica aqui do jeito automático do wrapper. Ver
    // `_conflitos.md`, item 12.
    return { marcacoes: resultado.marcacoes, totais: resultado.totais };
  },
});

// ----------------------------------------------------------------------------
// POST — API-ADM-MAR-002
// ----------------------------------------------------------------------------

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Pedido do usuário: além de marcar num plantão já existente, dá pra criar um
// plantão novo (sempre 1 vaga, exclusivo pra esta marcação) no mesmo passo —
// `novoPlantao` aqui, `criarPlantao` (API-ADM-PLA-001) reaproveitado dentro
// da mesma transação de `marcar_extra` em `marcarExtraAdmin` (ver doc-comment
// de `marcacoes-admin.ts`).
const NovoPlantaoSchema = z.object({
  cicloId: z.string().uuid(),
  rtId: z.string().uuid(),
  data: z
    .string()
    .regex(DATA_REGEX, 'Data deve estar no formato AAAA-MM-DD.')
    .transform((valor) => new Date(`${valor}T00:00:00.000Z`)),
  tipo: z.enum(['DIURNO', 'NOTURNO']),
  horaInicio: z.string().regex(HORA_REGEX, 'Hora deve estar no formato HH:MM.').optional(),
  horaFim: z.string().regex(HORA_REGEX, 'Hora deve estar no formato HH:MM.').optional(),
  permiteCruzada: z.boolean().nullable().default(null),
});

const MarcarBodySchema = z
  .object({
    plantaoId: z.string().uuid().optional(),
    novoPlantao: NovoPlantaoSchema.optional(),
    colaboradorId: z.string().uuid(),
    // Obrigatório (API-ADM-MAR-002, "R"): sem isso o colaborador vê uma extra
    // que não marcou e não há como explicar de onde veio.
    motivo: z.string().trim().min(1, 'Motivo é obrigatório.'),
  })
  .refine((v) => (v.plantaoId !== undefined) !== (v.novoPlantao !== undefined), {
    message: 'Informe exatamente um entre "plantaoId" (plantão existente) e "novoPlantao" (criar um novo).',
    path: ['plantaoId'],
  });

export const POST = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'marcacoes_por_sessao' },
  // Cast: mesma classe de erro de `../plantoes/lote/route.ts` (`_conflitos.md`,
  // item 13) — `novoPlantao.data` tem `.transform()` e `permiteCruzada` tem
  // `.default()`, então Input diverge de Output. Sem efeito em runtime.
  body: MarcarBodySchema as unknown as ZodSchema<z.infer<typeof MarcarBodySchema>>,
  // Response 201 (API-ADM-MAR-002, "Igual a API-COL-004") — `defineHandler`
  // usa 200 por padrão em toda rota, `statusSucesso` é o override explícito.
  statusSucesso: 201,
  handler: async ({ ator, body, ctx }) => {
    const prisma = await obterPrisma();
    return marcarExtraAdmin(prisma, {
      ...(body.plantaoId !== undefined ? { plantaoId: body.plantaoId } : {}),
      ...(body.novoPlantao !== undefined ? { novoPlantao: body.novoPlantao } : {}),
      colaboradorId: body.colaboradorId,
      motivo: body.motivo,
      adminId: ator.adminId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  },
});
