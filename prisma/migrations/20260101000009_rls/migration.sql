-- ============================================================================
-- 009_rls — SEC-RLS (specs/02-seguranca/rls-policies.md)
-- ============================================================================
-- Reorganizado pelo Agente D (Onda 1) a partir do conteúdo que a Onda 0
-- (segurança) já havia escrito em `20260101000006_sec_rls_policies` — corpo
-- SQL preservado SEM ALTERAÇÃO (specs/AGENTS.md marca `02-seguranca/` e as
-- políticas RLS como limite rígido: alteração exige revisão humana; mover de
-- pasta não é alterar o conteúdo).
--
-- ATENÇÃO — dependência de 007_funcoes (ainda stub nesta rodada): os blocos
-- `ALTER FUNCTION marcar_extra/cancelar_extra/gerar_escala_mensal` abaixo só
-- aplicam com sucesso em uma base vazia DEPOIS que os agentes FN-* tiverem
-- preenchido 007_funcoes com essas três funções, na mesma assinatura. Até
-- lá, aplicar esta migration isoladamente (ou a sequência completa) contra
-- uma base vazia falha por objeto inexistente — isso é esperado e está
-- documentado também no header de 007_funcoes. Não é responsabilidade deste
-- agente (DB-001/DB-005) resolver: é o motivo de a ordem canônica colocar
-- RLS depois de funções (03-banco/migrations.md: "RLS depois das tabelas,
-- grants depois das funções").
--
-- Fonte: specs/02-seguranca/rls-policies.md.
-- Conteúdo original: Onda 0 (segurança), `20260101000006_sec_rls_policies`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENABLE + FORCE ROW LEVEL SECURITY em TODAS as tabelas de public.
--    Sem policy = sem acesso. Nada de tabela "esquecida" aberta.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 2. app_server — acesso total via policy explícita, tabela a tabela.
--    FORCE RLS faz valer inclusive para o dono da tabela.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format(
      'CREATE POLICY app_full ON %I FOR ALL TO app_server USING (true) WITH CHECK (true)',
      t.tablename
    );
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 3. `plantao` — única leitura pública de verdade (para o Realtime funcionar
--    no navegador). Sem dado pessoal. Nenhum INSERT/UPDATE/DELETE para anon.
-- ----------------------------------------------------------------------------
CREATE POLICY plantao_leitura_anon ON plantao FOR SELECT TO anon
USING (
  ativo AND EXISTS (
    SELECT 1 FROM ciclo c WHERE c.id = plantao.ciclo_id AND c.status = 'PUBLICADO'
  )
);

-- ----------------------------------------------------------------------------
-- 4. `rt`, `codigo_escala` — leitura de referência, sem dado pessoal.
-- ----------------------------------------------------------------------------
CREATE POLICY rt_leitura_anon ON rt FOR SELECT TO anon USING (ativo);
CREATE POLICY codigo_leitura_anon ON codigo_escala FOR SELECT TO anon USING (ativo);

-- ----------------------------------------------------------------------------
-- 5. Todas as demais tabelas: deny total para `anon` por AUSÊNCIA de policy
--    (RLS habilitada + nenhuma policy para `anon` = nega tudo). Isso já vale
--    pelo passo 1 — nenhuma ação adicional necessária para `colaborador`,
--    `marcacao`, `escala_dia`, `ciclo`, `participacao_ciclo`,
--    `sessao_colaborador`, `tentativa_login`, `troca_escala`, `audit_log`.
--    Documentado aqui só para deixar explícito que é intencional, não
--    esquecimento (teste R3).
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 6. Funções SECURITY DEFINER: search_path fixo + execução revogada de
--    anon/authenticated. `search_path` fixo não é detalhe — sem ele,
--    SECURITY DEFINER é vetor clássico de escalada de privilégio.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER FUNCTION marcar_extra(uuid, uuid, origem_marcacao, text, text)
  SECURITY DEFINER SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION marcar_extra(uuid, uuid, origem_marcacao, text, text) TO app_server;

ALTER FUNCTION cancelar_extra(uuid, uuid, text)
  SECURITY DEFINER SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION cancelar_extra(uuid, uuid, text) TO app_server;

ALTER FUNCTION gerar_escala_mensal(uuid, int, int)
  SECURITY DEFINER SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION gerar_escala_mensal(uuid, int, int) TO app_server;

-- Toda função nova que precisar de SECURITY DEFINER entra nesta lista.
-- Funções SECURITY INVOKER (o padrão) não precisam de entrada aqui, mas
-- também não têm EXECUTE liberado para anon/authenticated por causa do
-- REVOKE amplo acima — liberar explicitamente se algum dia for necessário.

-- ----------------------------------------------------------------------------
-- 7. Realtime: só `plantao` entra na publication. Adicionar `marcacao` ou
--    `escala_dia` é violação direta de SEC-CONF.
-- ----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE plantao;
