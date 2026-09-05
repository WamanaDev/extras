-- ============================================================================
-- 001_extensoes — DB-005 (specs/03-banco/migrations.md), ordem canônica MG.
-- ============================================================================
-- Extensões usadas pelo schema inteiro: `pgcrypto` (gen_random_uuid() nos
-- defaults de PK — ver prisma/schema.prisma) e `btree_gist` (exclusion
-- constraints de 004_constraints, EXCLUDE USING gist sobre `uuid` +
-- `tstzrange`).
--
-- Reorganizado pelo Agente D (Onda 1) a partir do conteúdo que a Onda 0
-- (segurança) já tinha escrito em `20260101000002_sec_acid_extension_and_role_timeouts`
-- (que citava só `btree_gist`, provisoriamente, antes de existir schema).
-- `pgcrypto` é acrescentado aqui porque a ordem canônica de
-- `03-banco/migrations.md` pede as duas nesta migration. As alterações de
-- role (`ALTER ROLE app_server SET statement_timeout...`) daquela migration
-- original NÃO estão aqui — dependem do role `app_server` existir, então
-- foram movidas para `008_roles_grants`, junto de `CREATE ROLE`.
--
-- Fonte: specs/02-seguranca/acid.md (seção "Consistência" — btree_gist);
-- specs/03-banco/migrations.md (ordem canônica — pgcrypto).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
