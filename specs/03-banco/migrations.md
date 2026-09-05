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
008_rls                  -- SEC-RLS
009_roles_grants         -- SEC-CONF
010_seed_referencia      -- rt, codigo_escala
```

Ordem importa: RLS depois das tabelas, grants depois das funções.

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
