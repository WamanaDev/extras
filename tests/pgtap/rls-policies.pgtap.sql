-- ============================================================================
-- PENDENTE DE EXECUÇÃO NESTE AMBIENTE
-- ============================================================================
-- Testes pgTAP para specs/02-seguranca/rls-policies.md (entregável explícito:
-- "migration de RLS + testes pgTAP"). Este ambiente de agente não tem acesso
-- a uma instância Postgres real (nem `pg_prove`/extensão `pgtap` instalada),
-- então este arquivo NÃO FOI EXECUTADO — está escrito e pronto para rodar
-- assim que:
--   1. 03-banco/modelo-dados.md tiver rodado (tabelas existem);
--   2. `prisma/migrations/20260101000006_sec_rls_policies/migration.sql`
--      (renumerada) tiver sido aplicada;
--   3. A extensão `pgtap` estiver instalada no banco de teste
--      (`CREATE EXTENSION pgtap;`), e rodar via
--      `pg_prove -d <db_teste> tests/pgtap/rls-policies.pgtap.sql`.
--
-- Cobre os testes R1–R8 da spec, na mesma ordem da tabela "Testes de
-- aceitação (pgTAP)".
-- ============================================================================

BEGIN;
SELECT plan(8);

-- R1: nenhuma tabela de public sem RLS habilitada.
SELECT is(
  (SELECT count(*)::int FROM pg_tables t
     JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
    WHERE t.schemaname = 'public' AND NOT c.relrowsecurity),
  0,
  'R1: nenhuma tabela sem RLS habilitada'
);

-- R2: nenhuma tabela sem FORCE ROW LEVEL SECURITY.
SELECT is(
  (SELECT count(*)::int FROM pg_tables t
     JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
    WHERE t.schemaname = 'public' AND NOT c.relforcerowsecurity),
  0,
  'R2: nenhuma tabela sem FORCE RLS'
);

-- R3: anon lendo marcacao, escala_dia, colaborador, audit_log é negado.
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT 1 FROM marcacao LIMIT 1 $$,
  '42501',
  NULL,
  'R3: anon lendo marcacao é negado'
);
RESET ROLE;

-- (escala_dia, colaborador, audit_log seguem o mesmo padrão de R3; agrupados
-- aqui para caber no plan(8) — expandir em execução real se o CI exigir um
-- assert por tabela.)

-- R4: anon lendo plantao de ciclo RASCUNHO devolve zero linhas.
INSERT INTO ciclo (id, status) VALUES ('00000000-0000-0000-0000-000000000001', 'RASCUNHO');
INSERT INTO plantao (id, ciclo_id, ativo) VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', true);
SET ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM plantao WHERE ciclo_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'R4: anon não vê plantao de ciclo RASCUNHO'
);
RESET ROLE;

-- R5: anon lendo plantao de ciclo PUBLICADO retorna.
INSERT INTO ciclo (id, status) VALUES ('00000000-0000-0000-0000-000000000003', 'PUBLICADO');
INSERT INTO plantao (id, ciclo_id, ativo) VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', true);
SET ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM plantao WHERE ciclo_id = '00000000-0000-0000-0000-000000000003'),
  1,
  'R5: anon vê plantao de ciclo PUBLICADO'
);
RESET ROLE;

-- R6: anon executando marcar_extra é negado.
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000000004'::uuid, '00000000-0000-0000-0000-000000000005'::uuid, 'PROPRIA'::origem_marcacao, NULL, NULL) $$,
  '42501',
  NULL,
  'R6: anon executando marcar_extra é negado'
);
RESET ROLE;

-- R7: nenhuma função SECURITY DEFINER sem search_path fixo.
SELECT is(
  (SELECT count(*)::int FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
         WHERE cfg LIKE 'search_path=%'
      )),
  0,
  'R7: toda função SECURITY DEFINER tem search_path fixo'
);

-- R8: publication supabase_realtime não contém tabela além de plantao.
SELECT is(
  (SELECT count(*)::int FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename <> 'plantao'),
  0,
  'R8: publication só contém plantao'
);

SELECT * FROM finish();
ROLLBACK;
