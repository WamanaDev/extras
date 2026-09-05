-- ============================================================================
-- PENDENTE DE EXECUÇÃO NESTE AMBIENTE (mesma nota de rls-policies.pgtap.sql)
-- ============================================================================
-- Cobre testes de aceitação de specs/02-seguranca/confidencialidade.md (C3,
-- C6) e specs/02-seguranca/auditoria.md (A4), que dependem de roles/grants
-- criados pelas migrations 20260101000001/03/05. Requer as mesmas
-- pré-condições descritas em rls-policies.pgtap.sql.
-- ============================================================================

BEGIN;
SELECT plan(3);

-- C3: anon key tentando SELECT em marcacao é negado por RLS.
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT 1 FROM marcacao LIMIT 1 $$,
  '42501',
  NULL,
  'C3: anon lendo marcacao é negado por RLS'
);
RESET ROLE;

-- C6: app_server tentando DELETE FROM audit_log é negado (privilégio revogado).
SET ROLE app_server;
SELECT throws_ok(
  $$ DELETE FROM audit_log $$,
  '42501',
  NULL,
  'C6: app_server não pode DELETE em audit_log'
);
RESET ROLE;

-- A4: UPDATE em audit_log como app_server é negado.
SET ROLE app_server;
SELECT throws_ok(
  $$ UPDATE audit_log SET acao = 'ADULTERADO' $$,
  '42501',
  NULL,
  'A4/I3: app_server não pode UPDATE em audit_log'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
