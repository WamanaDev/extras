# Migrations

- **ID:** DB-005
- **Status:** PRONTA
- **Pré-requisitos:** `02-seguranca/integridade.md`

## Regras

| ID | Regra |
|---|---|
| MG-1 | Versionadas em `prisma/migrations/`, uma por PR sempre que possível |
| MG-2 | `prisma db push` **proibido** fora de banco local descartável |
| MG-3 | Toda migration aplica **e reverte** limpo em base vazia (CI valida) |
| MG-4 | Destrutiva (`DROP`) exige aprovação explícita + backup registrado |
| MG-5 | `NOT NULL` em tabela populada: coluna nullable → backfill → constraint (3 migrations) |
| MG-6 | Índice em produção: `CREATE INDEX CONCURRENTLY`, fora de transação |
| MG-7 | Nunca durante janela de marcação aberta (`SEC-DISP`) |
| MG-8 | Objeto que o Prisma não modela (função, trigger, RLS, exclusion) vive em SQL cru dentro da migration, nunca aplicado à mão |

MG-8 é o que mais se viola na prática: alguém roda a função no editor SQL do Supabase, funciona,
e o ambiente seguinte não tem. Se não está na migration, não existe.

## Ordem inicial

```
001_extensoes            -- pgcrypto, btree_gist
002_enums
003_tabelas
004_constraints          -- DB-002
005_triggers             -- DB-003
006_indices              -- DB-004
007_funcoes              -- 03-banco/funcoes/*
008_roles_grants         -- SEC-CONF (cria o role app_server)
009_rls                  -- SEC-RLS (policies referenciam app_server)
010_seed_referencia      -- rt, codigo_escala
```

Ordem importa: grants depois das funções, e **roles/grants antes de RLS** — as policies de
`009_rls` fazem `CREATE POLICY ... TO app_server`/`GRANT EXECUTE ... TO app_server`, e esse
role só existe a partir de `008_roles_grants` (`CREATE ROLE app_server ...`). A ordem inversa
(RLS antes de roles/grants) falha contra Postgres real com `role "app_server" does not exist`
(`42704`) — `roles_grants` não depende de nenhuma policy, só de tabelas já existentes desde
`003_tabelas`, então inverter é seguro.

## Seed

`prisma/seed.ts` é idempotente (`upsert`) e cria: RT1, RT2, códigos D/F/FT/FE, admin inicial
com senha temporária expirando em 24h. **Nunca** cria colaborador fictício em produção.

Em dev, `seed:dev` gera ~80 colaboradores sintéticos com matrículas fictícias
inexistentes em produção (`SEC-CONF`).

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| MG-T1 | `migrate deploy` em base vazia | sucesso |
| MG-T2 | Rollback de cada migration | limpo |
| MG-T3 | `migrate diff` schema vs banco após deploy | vazio |
| MG-T4 | Seed rodado 3× | mesmo estado final |
| MG-T5 | Função/trigger/RLS existe após deploy limpo | sim |
