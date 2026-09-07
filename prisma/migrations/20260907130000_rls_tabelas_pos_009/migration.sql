-- ============================================================================
-- Corrige gap de RLS nas tabelas criadas DEPOIS de 20260101000009_rls —
-- achado ao responder uma pergunta direta do usuário ("essas mudanças
-- seguiram as specs de segurança?"), não durante o trabalho original que
-- criou cada tabela. Ver `_conflitos.md`.
-- ============================================================================
-- `20260101000009_rls` habilita+força RLS e cria a policy `app_full` (só
-- `app_server` acessa, `FOR ALL`) para TODA tabela de `public` existente NO
-- MOMENTO em que aquela migration rodou, via loop sobre `pg_tables`. Quatro
-- tabelas nasceram DEPOIS dessa migration, em sessões seguintes, e nenhuma
-- delas passou pelo mesmo loop nem ganhou a policy manualmente:
--   - notificacao            (20260905120000_notificacoes_e_push)
--   - push_subscription      (20260905120000_notificacoes_e_push)
--   - google_calendar_conta  (20260905130000_google_calendar_conta)
--   - solicitacao_cancelamento (20260907120000_solicitacao_cancelamento)
--
-- Confirmado contra o banco real: `relrowsecurity = true` (RLS ligada, valor
-- herdado do template ou de um comportamento de default do Supabase) mas
-- `relforcerowsecurity = false` e ZERO linhas em `pg_policies` para as
-- quatro. RLS ligada sem nenhuma policy já nega acesso por padrão do
-- Postgres para qualquer role que não seja dona da tabela/superusuário —
-- então isso NÃO era uma vulnerabilidade ativa (anon/authenticated já
-- estavam de fora), mas também não seguia o padrão explícito e auditável do
-- resto do schema (uma `CREATE POLICY app_full` por tabela, igual
-- `marcacao`/`colaborador`/etc.) exigido por `specs/02-seguranca/
-- rls-policies.md`. `FORCE ROW LEVEL SECURITY` também nunca foi aplicado
-- nessas quatro (só importa se algum dia o dono da tabela ganhar um role de
-- conexão direta, mas alinhar com o padrão do resto do banco é o certo).
--
-- Corpo abaixo é a MESMA policy `app_full` que `20260101000009_rls` cria
-- para as demais tabelas — nenhuma regra nova, só extensão do padrão já
-- aprovado às quatro tabelas que ficaram de fora.
CREATE OR REPLACE FUNCTION aplicar_rls_padrao(p_tabela text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_tabela);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', p_tabela);
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p_tabela AND policyname = 'app_full'
  ) THEN
    EXECUTE format('CREATE POLICY app_full ON %I FOR ALL TO app_server USING (true) WITH CHECK (true)', p_tabela);
  END IF;
END
$$;

SELECT aplicar_rls_padrao('notificacao');
SELECT aplicar_rls_padrao('push_subscription');
SELECT aplicar_rls_padrao('google_calendar_conta');
SELECT aplicar_rls_padrao('solicitacao_cancelamento');

-- Função só de bootstrap desta migration — não fica pra trás como
-- utilitário de uso geral (nenhuma outra migration deveria depender dela;
-- futuras tabelas devem repetir o padrão explícito por clareza, como
-- `20260101000009_rls` já faz).
DROP FUNCTION aplicar_rls_padrao(text);
