# Extras — Escala 12x36 + horas extras

Sistema de escala 12x36 e distribuição de plantões extras para duas unidades
residenciais (RT1, RT2). Especificação completa em `specs/`.

## Stack

Next.js 15 (App Router) · TypeScript estrito · PostgreSQL 15 (Supabase) ·
Prisma · Supabase Realtime · Upstash Redis · Zod · Tailwind + shadcn/ui ·
Vitest + Playwright + pgTAP.

Ver `specs/00-fundacao/stack.md` para as decisões vinculantes (D-01..D-05).

## Setup de desenvolvimento

### Pré-requisitos

- Node.js >= 20
- pnpm >= 9
- Docker (para o Postgres local)

### Passos

1. Instale as dependências:

   ```sh
   pnpm install
   ```

2. Copie o arquivo de variáveis de ambiente e preencha os valores:

   ```sh
   cp .env.example .env
   ```

   Nunca commite `.env`. Em produção os segredos vivem no gerenciador de
   segredos da Vercel — ver `specs/00-fundacao/ambiente.md`.

3. Suba o Postgres local:

   ```sh
   docker compose -f docker-compose.dev.yml up -d
   ```

4. Aplique as migrations (quando existirem — ver `03-banco/`):

   ```sh
   pnpm prisma:migrate
   ```

5. Rode o servidor de desenvolvimento:

   ```sh
   pnpm dev
   ```

   O app valida as variáveis de ambiente com Zod no boot (`src/env.ts`) e
   falha ruidosamente se faltar alguma — não há fallback silencioso.

### Comandos úteis

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Testes unitários (Vitest) |
| `pnpm test:e2e` | Testes e2e (Playwright) |
| `pnpm prisma:migrate` | Cria/aplica migration em dev |
| `pnpm prisma:migrate:deploy` | Aplica migrations pendentes (CI/produção) |

### Regras importantes

- `prisma db push` é **proibido**. Toda mudança de schema nasce como
  migration versionada em `prisma/migrations/` (`specs/AGENTS.md`).
- Ambiente de dev **nunca** recebe dump de produção
  (`specs/02-seguranca/confidencialidade.md`).
- `TZ=America/Sao_Paulo` é obrigatório no runtime e no banco.

## Estrutura

```
prisma/schema.prisma   # datasource + generator (modelos vêm em 03-banco/*)
src/app/                # Next.js App Router
src/env.ts              # validação de env vars (Zod), único ponto de acesso
specs/                  # especificação completa do sistema
```
