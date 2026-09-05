/**
 * Validação central de variáveis de ambiente (FUND-004).
 *
 * Regra do contrato: nada de `process.env.X!` espalhado pelo código. Todo
 * acesso a variável de ambiente passa por este módulo. Se faltar alguma
 * variável obrigatória, o boot falha ruidosamente (o `parse` abaixo lança).
 *
 * Ver specs/00-fundacao/ambiente.md para a tabela de variáveis e seus escopos.
 */
import { z } from "zod";

/**
 * `TZ` é um nome de variável de ambiente RESERVADO na Vercel — não dá pra
 * cadastrar `TZ=America/Sao_Paulo` no dashboard de projeto nem via
 * `vercel.json` (`env`/`build.env`); a plataforma recusa/ignora. A spec
 * original (`00-fundacao/ambiente.md`) assumia que o operador configurava
 * isso na infraestrutura, o que quebra deploy na Vercel especificamente
 * (achado em uso real — build falhava com "TZ deve ser exatamente
 * 'America/Sao_Paulo'"). Em vez de exigir que a plataforma forneça a
 * variável, a aplicação garante o fuso ela mesma, ANTES de qualquer outro
 * código deste módulo (ou de qualquer um que o importe) rodar — precisa vir
 * antes do `serverSchema.safeParse` abaixo, e antes de qualquer conta de
 * data/hora em qualquer outro módulo, já que `src/env.ts` é importado cedo
 * por praticamente toda rota de API. Nunca falha o boot por causa disso: a
 * variável agora é auto-corrigida, não mais uma dependência externa.
 */
if (process.env.TZ !== "America/Sao_Paulo") {
  process.env.TZ = "America/Sao_Paulo";
}

const serverSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL é obrigatória (pooler :6543, pgbouncer=true)"),
  DIRECT_URL: z
    .string()
    .min(1, "DIRECT_URL é obrigatória (conexão direta :5432, só migrations)"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY é obrigatória"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET deve ter ao menos 32 bytes"),
  PIN_PEPPER: z.string().min(1, "PIN_PEPPER é obrigatória"),
  UPSTASH_REDIS_REST_URL: z
    .string()
    .url("UPSTASH_REDIS_REST_URL deve ser uma URL válida"),
  UPSTASH_REDIS_REST_TOKEN: z
    .string()
    .min(1, "UPSTASH_REDIS_REST_TOKEN é obrigatória"),
  // Sanity check pós-autocorreção (ver bloco acima, antes deste schema) —
  // não é mais uma variável que o operador precisa configurar na
  // plataforma. Mensagem de erro clara sem depender da forma exata da API
  // de customização de mensagem do Zod entre versões: valida com refine.
  TZ: z
    .string()
    .refine((value) => value === "America/Sao_Paulo", {
      message: "TZ deve ser exatamente 'America/Sao_Paulo'",
    }),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // Web Push (preparação de infra — nenhum gatilho de negócio dispara push
  // ainda, ver src/server/notificacoes/push.ts). Opcionais de propósito: as
  // chaves reais ainda não foram geradas, e o boot não deve quebrar por
  // causa disso. Gerar com `npx web-push generate-vapid-keys` (ou
  // `webpush.generateVAPIDKeys()`) antes de habilitar push de verdade, e
  // adicionar em `.env.local`/`.env.example` (`.env.example` só com
  // placeholder, nunca a chave real).
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL deve ser uma URL válida"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY é obrigatória"),
  // Ver comentário de VAPID_PRIVATE_KEY acima — par público, opcional pelo mesmo motivo.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;
export type Env = ServerEnv & ClientEnv;

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
}

// Next.js só inlina `process.env.NEXT_PUBLIC_X` quando a referência é
// estática e literal — por isso as variáveis de cliente são lidas uma a uma
// aqui (nunca via `process.env` dinâmico), tanto no bundle do browser quanto
// no servidor.
const clientRaw = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
};

function fail(error: z.ZodError): never {
  const details = formatZodError(error);
  // Falha ruidosa e intencional: preferimos crashar o boot a rodar com
  // configuração incompleta. Não logar valores de env (podem ser segredo).
  // eslint-disable-next-line no-console
  console.error(
    `[env] Variáveis de ambiente inválidas ou ausentes:\n${details}`,
  );
  throw new Error(
    "Configuração de ambiente inválida. Veja o console para detalhes.",
  );
}

function loadEnv(): Env {
  const isServer = typeof window === "undefined";

  const clientResult = clientSchema.safeParse(clientRaw);
  if (!clientResult.success) {
    fail(clientResult.error);
  }

  if (!isServer) {
    // No browser só as variáveis públicas existem; o restante do schema
    // (segredos) nunca chega ao bundle do cliente.
    return clientResult.data as Env;
  }

  const serverResult = serverSchema.safeParse(process.env);
  if (!serverResult.success) {
    fail(serverResult.error);
  }

  return { ...serverResult.data, ...clientResult.data } as Env;
}

export const env = loadEnv();
