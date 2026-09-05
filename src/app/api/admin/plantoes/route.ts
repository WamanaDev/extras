/**
 * API-ADM-PLA-001 — `POST /api/admin/plantoes`.
 * `specs/04-api/admin-plantoes/API-ADM-PLA-001-criar.md`.
 */
import { z, type ZodSchema } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { emTransacao } from '@/server/db/tx';
import { obterPrisma } from '@/server/db/cliente';
import { HORA_REGEX } from '@/server/plantoes/util';
import { criarPlantao } from '@/server/plantoes/criar';

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const CriarPlantaoSchema = z.object({
  cicloId: z.string().uuid(),
  rtId: z.string().uuid(),
  data: z
    .string()
    .regex(DATA_REGEX, 'Data deve estar no formato AAAA-MM-DD.')
    .transform((valor) => new Date(`${valor}T00:00:00.000Z`)),
  tipo: z.enum(['DIURNO', 'NOTURNO']),
  horaInicio: z.string().regex(HORA_REGEX, 'Hora deve estar no formato HH:MM.').optional(),
  horaFim: z.string().regex(HORA_REGEX, 'Hora deve estar no formato HH:MM.').optional(),
  vagasTotais: z.number().int().positive(),
  // CIA (API-ADM-PLA-001): `.nullable()`, não `.optional()` — `null` explícito
  // significa "herdar do ciclo", distinto de omitir o campo. `.default(null)`
  // cobre o caso de omissão sem exigir que o cliente sempre mande `null`.
  permiteCruzada: z.boolean().nullable().default(null),
  observacao: z.string().optional(),
});

export const POST = defineHandler({
  ator: 'ADMIN',
  // Sem `rateLimit`: `EscopoRateLimit` (`02-seguranca/disponibilidade.md`,
  // `src/server/http/rate-limit.ts`) não tabela nenhum escopo para mutação
  // administrativa (só login, marcação/leitura de colaborador e IP global) —
  // ver `_conflitos.md`. `rateLimit` é opcional em `ConfigHandler`; melhor
  // omitir do que aplicar um escopo de outro domínio (`marcacoes_por_sessao`
  // é da marcação de extra pelo colaborador, não desta rota).
  //
  // Cast: `body?: ZodSchema<TBody>` em `handler.ts` fixa `Input === Output`
  // (`ZodSchema<T>` = `ZodType<T, ZodTypeDef, T>` por padrão) — `data` aqui
  // tem `.transform()` (`string` → `Date`), então o Input real diverge do
  // Output. Gap estrutural pré-existente de `handler.ts`, já confirmado em
  // `admin/colaboradores/route.ts` e nesta mesma rota (`_conflitos.md`, item
  // 13) — corrigir na raiz mexeria em infra compartilhada por todo
  // `04-api/*`, fora do escopo de `admin-plantoes`. Mesmo cast local já usado
  // em `admin/marcacoes/route.ts`: sem efeito em runtime (`safeParse` não lê
  // o parâmetro `Input` do tipo, só a implementação do schema).
  body: CriarPlantaoSchema as unknown as ZodSchema<z.infer<typeof CriarPlantaoSchema>>,
  handler: async ({ ator, body, ctx }) => {
    const prisma = await obterPrisma();
    return emTransacao(prisma, (tx) =>
      criarPlantao(tx, body, {
        atorId: ator.adminId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      }),
    );
  },
});
