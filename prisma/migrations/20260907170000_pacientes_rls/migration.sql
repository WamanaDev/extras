-- ============================================================================
-- pacientes_rls — SEC-SAUDE (specs/02-seguranca/dados-sensiveis-saude.md)
-- ============================================================================
-- specs/AGENTS.md marca políticas RLS como limite rígido. Mesmo tratamento
-- de 20260907150000_pacientes_constraints: comissionado nesta branch,
-- transcrição literal de SEC-SAUDE ("RLS — princípio") e DB-006/RNP-*
-- ("Least privilege").
--
-- Ordem: depois das funções (grants de EXECUTE dependem delas existirem) —
-- 03-banco/migrations.md, "grants depois das funções".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RLS: ENABLE + FORCE em todas as tabelas novas, policy app_full só para
--    app_server. Nenhuma policy para anon — RLS habilitada + zero policy já
--    nega tudo (mesmo padrão de 20260101000009_rls e do catch-up
--    20260907130000_rls_tabelas_pos_009).
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'paciente', 'agendamento', 'medicamento', 'prescricao', 'administracao_medicamento'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY app_full ON %I FOR ALL TO app_server USING (true) WITH CHECK (true)', t);
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 2. Least privilege — SEC-SAUDE.
-- ----------------------------------------------------------------------------

-- Inativação/cancelamento/suspensão é sempre UPDATE de status, nunca DELETE
-- (mesmo racional de marcacao/escala_dia em SEC-CONF).
REVOKE DELETE ON paciente, agendamento, prescricao, administracao_medicamento FROM app_server;

-- app_readonly ganhou SELECT em todas as tabelas novas via `ALTER DEFAULT
-- PRIVILEGES` (008_roles_grants) — revogado aqui só para as duas com dado
-- clínico direto. `paciente`/`agendamento`/`medicamento` continuam legíveis
-- por app_readonly (relatório administrativo não-clínico, API-ADM-REL-*).
REVOKE SELECT ON prescricao, administracao_medicamento FROM app_readonly;

-- ----------------------------------------------------------------------------
-- 3. Funções — REVOKE EXECUTE padrão (Postgres concede a PUBLIC na criação)
--    + GRANT explícito só para app_server. Mesmo padrão de marcar_extra/
--    cancelar_extra/gerar_escala_mensal em 20260101000009_rls.
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION criar_agendamento(
  uuid, tipo_agendamento, text, text, timestamptz, timestamptz, uuid, text,
  origem_agendamento, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION criar_agendamento(
  uuid, tipo_agendamento, text, text, timestamptz, timestamptz, uuid, text,
  origem_agendamento, uuid, uuid
) TO app_server;

REVOKE EXECUTE ON FUNCTION cancelar_agendamento(uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cancelar_agendamento(uuid, text, uuid, uuid) TO app_server;

REVOKE EXECUTE ON FUNCTION separar_medicamento(uuid, uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION separar_medicamento(uuid, uuid, timestamptz, uuid) TO app_server;

REVOKE EXECUTE ON FUNCTION agenda_rt(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION agenda_rt(uuid, date, date) TO app_server;

REVOKE EXECUTE ON FUNCTION alertas_medicamento(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION alertas_medicamento(uuid, int) TO app_server;

REVOKE EXECUTE ON FUNCTION conferir_medicamento(uuid, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION conferir_medicamento(uuid, uuid, boolean, text) TO app_server;

REVOKE EXECUTE ON FUNCTION administrar_medicamento(uuid, uuid, status_administracao, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION administrar_medicamento(uuid, uuid, status_administracao, text) TO app_server;
