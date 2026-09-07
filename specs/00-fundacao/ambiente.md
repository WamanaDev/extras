# Ambiente

- **ID:** FUND-004
- **Status:** PRONTA
- **Entregáveis:** `.env.example`, `docker-compose.dev.yml`, `README` de setup

## Variáveis

| Variável | Escopo | Descrição |
|---|---|---|
| `DATABASE_URL` | server | Pooler `:6543` com `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | server | Conexão direta `:5432`, só migrations |
| `NEXT_PUBLIC_SUPABASE_URL` | client | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Só Realtime de leitura em `plantao` |
| `SUPABASE_SERVICE_ROLE_KEY` | server | **Nunca** exposta ao cliente |
| `SESSION_SECRET` | server | Assinatura do cookie (≥ 32 bytes) |
| `PIN_PEPPER` | server | Pepper do hash de PIN |
| `UPSTASH_REDIS_REST_URL` | server | Rate limit |
| `UPSTASH_REDIS_REST_TOKEN` | server | Rate limit |
| `TZ` | ambos | `America/Sao_Paulo`. **Vercel**: nome reservado, não configurável via dashboard/`vercel.json` — a aplicação (`src/env.ts`) seta isso sozinha no boot, nada a configurar na plataforma. Só precisa estar em `.env.local` para dev local. |
| `GOOGLE_CLIENT_ID` | server, opcional | Integração Google Calendar (`API-COL-008`) — credencial OAuth do Google Cloud Console. Sem ela, a integração fica desabilitada, sem quebrar o boot |
| `GOOGLE_CLIENT_SECRET` | server, opcional | Idem |
| `CALENDAR_TOKEN_KEY` | server, opcional | Chave AES-256-GCM (64 hex chars/32 bytes) que cifra o refresh token do Google antes de gravar no banco. Gerar com `openssl rand -hex 32` |

## Regras

- Segredos vivem no gerenciador de segredos da Vercel. Nada de `.env` commitado.
- Rotação de `SESSION_SECRET` invalida todas as sessões — é o botão de pânico.
- Rotação de pepper exige rehash em massa; documentar antes de precisar.
- **Ambiente de dev nunca recebe dump de produção.** Ver `02-seguranca/confidencialidade.md`,
  seção "Dados em ambientes não-produtivos".

## Checagem de arranque

A aplicação valida as variáveis com Zod no boot e **falha ruidosamente** se faltar alguma.
Nada de `process.env.X!` espalhado pelo código: um único `src/env.ts` tipado.

## Build/deploy

`package.json` declara `"postinstall": "prisma generate"` — o Prisma Client é gerado
automaticamente logo após `npm install`, sem passo manual. Necessário na Vercel: o ambiente
de build ali roda `install` e `build` como etapas separadas, e sem esse script o build falha
por não encontrar o client gerado.
