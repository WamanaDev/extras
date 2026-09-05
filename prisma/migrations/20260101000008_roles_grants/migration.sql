-- ============================================================================
-- 008_roles_grants — SEC-CONF (specs/02-seguranca/confidencialidade.md)
-- ============================================================================
-- Reorganizado pelo Agente D (Onda 1), mesclando o conteúdo que a Onda 0
-- (segurança) já havia escrito em três migrations separadas, sem alterar o
-- corpo das instruções (specs/AGENTS.md marca `02-seguranca/` como limite
-- rígido — alteração exige revisão humana):
--
--   - `20260101000001_sec_conf_roles`                       → CREATE ROLE
--   - `20260101000002_sec_acid_extension_and_role_timeouts` → ALTER ROLE ... SET
--     (só a parte de timeouts; a extensão btree_gist foi para 001_extensoes)
--   - `20260101000003_sec_conf_least_privilege_grants`      → GRANT/REVOKE
--   - `20260101000005_sec_aud_audit_log_hash_chain`         → REVOKE extra em
--     audit_log para app_readonly (INSERT), que a migration 3 não cobria
--
-- Motivo de mesclar: `CREATE ROLE` não depende de tabela nenhuma, mas
-- `ALTER ROLE app_server SET ...` depende do role já existir, e os `GRANT`/
-- `REVOKE` nomeados (audit_log, marcacao, escala_dia) dependem das tabelas de
-- 003_tabelas já existirem. Juntar num só arquivo, na posição canônica
-- (depois de funções — `03-banco/migrations.md`: "grants depois das
-- funções"), evita reintroduzir o problema de ordem que motivou este reorg.
--
-- Fonte: specs/02-seguranca/confidencialidade.md (seção "Least privilege no
-- banco"); specs/02-seguranca/acid.md (seção "Isolamento" — timeouts).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Roles (nenhum superusuário).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_server') THEN
    CREATE ROLE app_server LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_readonly') THEN
    CREATE ROLE app_readonly LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

-- `anon` e `authenticated` já existem em qualquer projeto Supabase — não são
-- criados aqui. Ver specs/02-seguranca/rls-policies.md para o uso de `anon`.

COMMENT ON ROLE app_server IS 'SEC-CONF: role da aplicação (Next.js server). Sem DELETE salvo sessao_colaborador. Sem DDL.';
COMMENT ON ROLE app_readonly IS 'SEC-CONF: role de relatórios/BI. Só SELECT.';

-- ----------------------------------------------------------------------------
-- Timeouts por role (SEC-ACID "Isolamento" / SEC-DISP "Timeouts em cascata").
-- lock_timeout < statement_timeout: espera por lock devolve 55P03
-- identificável em vez de estourar o statement inteiro (vira SISTEMA_OCUPADO
-- na API, Retry-After: 1 — ver src/server/db/tx.ts).
-- ----------------------------------------------------------------------------
ALTER ROLE app_server SET statement_timeout = '8s';
ALTER ROLE app_server SET lock_timeout = '3s';
ALTER ROLE app_server SET idle_in_transaction_session_timeout = '15s';

-- app_readonly roda relatórios/BI — mesmo teto de idle-in-transaction para não
-- esgotar o pool (SEC-DISP, D4: query pesada de relatório na janela).
ALTER ROLE app_readonly SET statement_timeout = '30s';
ALTER ROLE app_readonly SET idle_in_transaction_session_timeout = '15s';

-- ----------------------------------------------------------------------------
-- Least privilege no banco (SEC-CONF).
-- ----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO app_server, app_readonly, anon;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_server;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;

-- Sequences: app_server precisa gerar valores default (ids não-uuid, se houver).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_server;

-- Herda automaticamente para tabelas criadas depois desta migration —
-- reduz o risco da "tabela esquecida" citada em SEC-RLS.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO app_server;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;

-- Append-only: audit_log nunca é alterada nem apagada por app_server (AUD-1),
-- nem por app_readonly (que só deveria SELECT de qualquer forma).
REVOKE UPDATE, DELETE ON audit_log FROM app_server;
REVOKE UPDATE, DELETE, INSERT ON audit_log FROM app_readonly;

-- Cancelamento é UPDATE status = 'CANCELADA', jamais DELETE — o histórico é o
-- produto.
REVOKE DELETE ON marcacao, escala_dia FROM app_server;

-- `anon` só lê o que as policies de RLS liberarem explicitamente (plantao, rt,
-- codigo_escala) — ver migration 009_rls. Nenhum INSERT/UPDATE/DELETE para
-- anon em tabela nenhuma.
