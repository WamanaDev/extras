-- ============================================================================
-- 007_funcoes — specs/03-banco/funcoes/*
-- ============================================================================
-- Cada função (FN-002..FN-009, FN-001 já é `preencher_intervalo` em
-- 005_triggers) é escopo de um agente FN-*, um por spec em
-- `specs/03-banco/funcoes/`, que apenda seu `CREATE OR REPLACE FUNCTION` a
-- este arquivo, em ordem, um por vez:
--
--   FN-002  gerar_escala_mensal          (transacional)      — feito abaixo
--   FN-003  blocos_ocupados              (leitura)           — feito abaixo
--   FN-004  valida_descanso              (leitura) — limite rígido, revisão humana — feito abaixo
--   FN-005  marcar_extra                 (transacional) — limite rígido, revisão humana — feito abaixo
--   FN-006  cancelar_extra               (transacional)      — feito abaixo
--   FN-007  plantoes_para_colaborador    (leitura)           — feito abaixo
--   FN-008  saldo_colaborador            (leitura)           — feito abaixo
--   FN-009  cobertura_ciclo              (leitura)           — feito abaixo
--
-- IMPORTANTE para os próximos agentes FN-*: 009_rls (nesta mesma pasta de
-- migrations) já contém `ALTER FUNCTION marcar_extra(...)`, `ALTER FUNCTION
-- cancelar_extra(...)` e `ALTER FUNCTION gerar_escala_mensal(...)` com
-- `SECURITY DEFINER SET search_path` + `GRANT EXECUTE ... TO app_server`
-- (herdado da Onda 0/segurança, SEC-RLS). Essas três funções PRECISAM existir
-- (isto é, este arquivo 007_funcoes precisa estar preenchido com as
-- assinaturas exatas usadas em 009_rls: `marcar_extra(uuid, uuid,
-- origem_marcacao, text, text)`, `cancelar_extra(uuid, uuid, text)`,
-- `gerar_escala_mensal(uuid, int, int)`) antes que a sequência completa de
-- migrations possa ser aplicada de ponta a ponta em uma base vazia (MG-3).
-- Confira a assinatura contra `03-banco/funcoes/fn-*.md` ao implementar.
--
-- Fonte: specs/03-banco/funcoes/README.md.
--
-- STATUS (agente G9, Onda 1, fechamento da onda de banco de dados): as 8
-- funções desta lista (FN-002..FN-009) estão todas presentes abaixo, em
-- ordem de chegada dos agentes (não em ordem numérica do ID — FN-003/004/005
-- vêm antes de FN-002 no arquivo porque FN-002 depende de FN-003/004 só
-- indiretamente via a ordem em que os agentes rodaram; cada função é
-- autocontida e não depende de posição textual, só de já existir no catálogo
-- no momento em que `CREATE OR REPLACE` roda — Postgres resolve por nome,
-- não por ordem de arquivo). Passada de sanidade completa (balanceamento dos
-- delimitadores de dollar-quoting, ponto-e-vírgula final em cada statement,
-- sem duplicata, sem placeholder) feita ao final deste arquivo por este
-- mesmo agente — ver comentário no fim do arquivo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FN-003 — blocos_ocupados (specs/03-banco/funcoes/fn-003-blocos-ocupados.md)
-- ----------------------------------------------------------------------------
-- Blocos ocupados de um colaborador na janela [p_de, p_ate): união de
-- `escala_dia` (código com presenca OU ocupa_horario — FT/FE não liberam o
-- horário, só F libera) com `marcacao` confirmada. `ORDER BY 1` porque FN-004
-- depende de ordenação. Usa `idx_escala_ocupacao` e `idx_marcacao_ocupacao`
-- (006_indices).
--
-- Nota (ver _conflitos.md, item novo desta rodada): o corpo publicado na spec
-- junta por `ce.codigo = e.codigo`, mas `escala_dia` (03-banco/modelo-dados.md,
-- prisma/schema.prisma) não tem coluna `codigo` — tem `codigo_escala_id`
-- (FK para `codigo_escala.id`). Ajustado para `ce.id = e.codigo_escala_id`,
-- preservando o resto do corpo (filtro `presenca OR ocupa_horario`, união com
-- `marcacao`, `ORDER BY 1`) ao pé da letra.
CREATE OR REPLACE FUNCTION blocos_ocupados(
  p_colaborador_id uuid, p_de timestamptz, p_ate timestamptz
) RETURNS TABLE (inicio_em timestamptz, fim_em timestamptz, origem text, referencia_id uuid)
LANGUAGE sql STABLE AS $$
  SELECT e.inicio_em, e.fim_em, 'ESCALA'::text, e.id
    FROM escala_dia e
    JOIN codigo_escala ce ON ce.id = e.codigo_escala_id
   WHERE e.colaborador_id = p_colaborador_id
     AND (ce.presenca OR ce.ocupa_horario)
     AND e.inicio_em < p_ate AND e.fim_em > p_de
  UNION ALL
  SELECT m.inicio_em, m.fim_em, 'EXTRA'::text, m.id
    FROM marcacao m
   WHERE m.colaborador_id = p_colaborador_id
     AND m.status = 'CONFIRMADA'
     AND m.inicio_em < p_ate AND m.fim_em > p_de
  ORDER BY 1;
$$;

-- ----------------------------------------------------------------------------
-- FN-004 — valida_descanso (specs/03-banco/funcoes/fn-004-valida-descanso.md)
-- ----------------------------------------------------------------------------
-- LIMITE RÍGIDO (specs/AGENTS.md: "Corpo de FN-005 marcar_extra e FN-004
-- valida_descanso" exige revisão humana para alteração). Implementado nesta
-- rodada com autorização explícita do usuário para prosseguir mesmo assim —
-- ver instrução da tarefa. Corpo transcrito ao pé da letra da spec, sem
-- simplificação: uma varredura, sem laço de queries adicional além do loop
-- de contiguidade já previsto no pseudocódigo.
--
-- Conferido contra o "espelho em TypeScript" (src/lib/escala/blocos.ts,
-- Onda 0): mesma janela derivada `(max_blocos + 1) * 12h` (não constante
-- fixa), mesma regra de sobreposição (`inicio_em < fim` AND `fim_em >
-- inicio`, intervalo semiaberto), mesma regra de contiguidade por igualdade
-- exata de timestamp (`inicio_em = fim anterior`), mesmo `corrida` inicial
-- em 1 e mesmo teste `> p_max_blocos`. Nenhuma divergência de lógica
-- encontrada entre o corpo SQL abaixo e `validaDescanso`/`blocoDoTurno` em
-- blocos.ts — nenhum item novo registrado em `_conflitos.md` para esta
-- função. Depende de `blocos_ocupados` (FN-003, acima), já ajustada nesta
-- mesma migration para o schema real (join por `codigo_escala_id`); essa
-- correção é transparente para `valida_descanso`, que só consome as colunas
-- `inicio_em`/`fim_em` retornadas — nenhum ajuste adicional necessário aqui.
CREATE OR REPLACE FUNCTION valida_descanso(
  p_colaborador_id uuid, p_inicio timestamptz, p_fim timestamptz, p_max_blocos int
) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_janela interval := ((p_max_blocos + 1) * 12) * interval '1 hour';
  v_b record; v_prev_fim timestamptz; v_corrida int := 1;
BEGIN
  -- 1. sobreposição (RN-13)
  IF EXISTS (
    SELECT 1 FROM blocos_ocupados(p_colaborador_id, p_inicio - v_janela, p_fim + v_janela)
     WHERE inicio_em < p_fim AND fim_em > p_inicio
  ) THEN RETURN 'CONFLITO_DE_HORARIO'; END IF;

  -- 2. cadeia contígua incluindo o bloco novo (RN-12)
  FOR v_b IN
    SELECT inicio_em, fim_em
      FROM (
        SELECT inicio_em, fim_em
          FROM blocos_ocupados(p_colaborador_id, p_inicio - v_janela, p_fim + v_janela)
        UNION ALL SELECT p_inicio, p_fim
      ) t ORDER BY inicio_em
  LOOP
    IF v_prev_fim IS NOT NULL AND v_b.inicio_em = v_prev_fim THEN
      v_corrida := v_corrida + 1;
      IF v_corrida > p_max_blocos THEN RETURN 'EXCEDE_JORNADA'; END IF;
    ELSE
      v_corrida := 1;
    END IF;
    v_prev_fim := v_b.fim_em;
  END LOOP;

  RETURN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- FN-005 — marcar_extra (specs/03-banco/funcoes/fn-005-marcar-extra.md)
-- ----------------------------------------------------------------------------
-- LIMITE RÍGIDO (specs/AGENTS.md: "Corpo de FN-005 marcar_extra e FN-004
-- valida_descanso" exige revisão humana para alteração). Implementado nesta
-- rodada com autorização explícita do usuário para prosseguir mesmo assim.
-- ORDEM DE EXECUÇÃO preservada exatamente como publicada na spec (não é
-- estética — previne deadlock e define qual erro o usuário vê primeiro):
--   1. advisory lock do colaborador → 2. plantao FOR UPDATE → 3. ciclo
--   (existe/PUBLICADO/janela) → 4. colaborador ativo → 5. participacao (não
--   bloqueado) → 6. RT cruzada → 7. ausência no dia → 8. valida_descanso
--   (FN-004) → 9. limite do ciclo → 10. vagas → 11. INSERT + UPDATE contador.
-- Nenhum passo reordenado, simplificado ou pulado.
--
-- Duas divergências entre o corpo publicado na spec e o schema real
-- (prisma/schema.prisma) encontradas e corrigidas — registradas em
-- _conflitos.md (itens 5 e 6), mesmo padrão do ajuste já feito em FN-003
-- (ver comentário acima): resolução mínima só para manter a migration
-- aplicável, lógica de negócio preservada ao pé da letra.
--
-- (a) Passo 7 (ausência no dia): a spec lê `v_escala.codigo <> 'D'`, mas
--     `escala_dia` não tem coluna `codigo` — tem `codigo_escala_id` (FK para
--     `codigo_escala.id`), exatamente a mesma divergência já documentada em
--     FN-003. Corrigido para buscar o texto do código via JOIN em
--     `codigo_escala` (`v_escala_codigo`), preservando literalmente a regra
--     (`FOUND AND codigo <> 'D' AND NOT permite_extra_em_folga →
--     EM_AUSENCIA`).
-- (b) Passo 11 (INSERT): a spec grava `p_ip`/`p_user_agent` diretamente em
--     colunas `ip`/`user_agent` de `marcacao`. A tabela `marcacao`
--     (prisma/migrations/20260101000003_tabelas, model Marcacao em
--     schema.prisma) não tem essas colunas — só `sessao_colaborador`,
--     `tentativa_login` e `audit_log` as têm. `CREATE FUNCTION` falharia em
--     tempo de criação (checagem de corpo do plpgsql valida a existência de
--     coluna). Os parâmetros `p_ip`/`p_user_agent` permanecem na assinatura
--     (exigido por 009_rls, que declara `marcar_extra(uuid, uuid,
--     origem_marcacao, text, text)`), mas não são gravados aqui — ficam
--     disponíveis para o chamador usar no `INSERT INTO audit_log` da mesma
--     transação (ACID/AUD-2, seção "D" da spec: "audit_log gravado pelo
--     chamador na mesma transação"), que é de fato onde `ip`/`user_agent`
--     têm coluna própria.
--
-- Nenhuma outra coluna/tabela referenciada no corpo diverge do schema real
-- (plantao, colaborador, ciclo, participacao_ciclo, marcacao, rt_id,
-- permite_cruzada, permite_extra_em_folga conferem no nome e no tipo).
CREATE OR REPLACE FUNCTION marcar_extra(
  p_plantao_id uuid, p_colaborador_id uuid,
  p_origem origem_marcacao DEFAULT 'COLABORADOR',
  p_ip text DEFAULT NULL, p_user_agent text DEFAULT NULL
) RETURNS marcacao LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_plantao plantao%ROWTYPE; v_colab colaborador%ROWTYPE; v_ciclo ciclo%ROWTYPE;
  v_part participacao_ciclo%ROWTYPE; v_escala_codigo text;
  v_erro text; v_limite int; v_usadas int; v_cruzada boolean; v_result marcacao%ROWTYPE;
BEGIN
  -- 1. advisory lock do colaborador — SEMPRE primeiro (SEC-ACID).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_colaborador_id::text, 0));

  -- 2. plantao FOR UPDATE.
  SELECT * INTO v_plantao FROM plantao WHERE id = p_plantao_id FOR UPDATE;
  IF NOT FOUND OR NOT v_plantao.ativo THEN RAISE EXCEPTION 'PLANTAO_INDISPONIVEL'; END IF;

  -- 3. ciclo: existe, PUBLICADO, dentro da janela (janela ignorada para ADMIN — RN-27).
  SELECT * INTO v_ciclo FROM ciclo WHERE id = v_plantao.ciclo_id;
  IF v_ciclo.status <> 'PUBLICADO' THEN RAISE EXCEPTION 'CICLO_FECHADO'; END IF;
  IF p_origem = 'COLABORADOR' THEN
    IF v_ciclo.abertura_marcacao IS NOT NULL AND now() < v_ciclo.abertura_marcacao
       THEN RAISE EXCEPTION 'JANELA_NAO_ABERTA'; END IF;
    IF v_ciclo.fechamento_marcacao IS NOT NULL AND now() > v_ciclo.fechamento_marcacao
       THEN RAISE EXCEPTION 'JANELA_ENCERRADA'; END IF;
  END IF;

  -- 4. colaborador ativo.
  SELECT * INTO v_colab FROM colaborador WHERE id = p_colaborador_id AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'COLABORADOR_INATIVO'; END IF;

  -- 5. participacao: não bloqueado.
  SELECT * INTO v_part FROM participacao_ciclo
   WHERE ciclo_id = v_ciclo.id AND colaborador_id = p_colaborador_id;
  IF COALESCE(v_part.bloqueado, false) THEN RAISE EXCEPTION 'COLABORADOR_BLOQUEADO'; END IF;

  -- 6. RT cruzada.
  v_cruzada := v_plantao.rt_id <> v_colab.rt_id;
  IF v_cruzada AND NOT COALESCE(
       v_part.permite_cruzada, v_plantao.permite_cruzada, v_ciclo.permite_cruzada, false)
     THEN RAISE EXCEPTION 'CRUZADA_BLOQUEADA'; END IF;

  -- 7. ausência no dia. Ajuste (a): codigo via JOIN em codigo_escala
  -- (escala_dia não tem coluna codigo — ver comentário acima).
  SELECT ce.codigo INTO v_escala_codigo
    FROM escala_dia e JOIN codigo_escala ce ON ce.id = e.codigo_escala_id
   WHERE e.colaborador_id = p_colaborador_id AND e.data = v_plantao.data;
  IF FOUND AND v_escala_codigo <> 'D' AND NOT v_ciclo.permite_extra_em_folga
     THEN RAISE EXCEPTION 'EM_AUSENCIA'; END IF;

  -- 8. valida_descanso (FN-004).
  v_erro := valida_descanso(p_colaborador_id, v_plantao.inicio_em, v_plantao.fim_em,
                            v_ciclo.max_blocos_seguidos);
  IF v_erro IS NOT NULL THEN RAISE EXCEPTION '%', v_erro; END IF;

  -- 9. limite do ciclo.
  v_limite := COALESCE(v_part.limite_override, v_ciclo.limite_padrao);
  SELECT count(*) INTO v_usadas
    FROM marcacao m JOIN plantao p ON p.id = m.plantao_id
   WHERE m.colaborador_id = p_colaborador_id AND m.status = 'CONFIRMADA'
     AND p.ciclo_id = v_ciclo.id;
  IF v_usadas >= v_limite THEN RAISE EXCEPTION 'LIMITE_ATINGIDO'; END IF;

  -- 10. vagas.
  IF v_plantao.vagas_ocupadas >= v_plantao.vagas_totais THEN RAISE EXCEPTION 'SEM_VAGA'; END IF;

  -- 11. INSERT + UPDATE contador, mesma transação (ACID — A). Ajuste (b):
  -- sem ip/user_agent (marcacao não tem essas colunas — ver comentário acima).
  INSERT INTO marcacao (id, plantao_id, colaborador_id, status, cruzada, origem)
  VALUES (gen_random_uuid(), p_plantao_id, p_colaborador_id, 'CONFIRMADA', v_cruzada, p_origem)
  RETURNING * INTO v_result;

  UPDATE plantao SET vagas_ocupadas = vagas_ocupadas + 1 WHERE id = p_plantao_id;
  RETURN v_result;
END $$;

-- ----------------------------------------------------------------------------
-- FN-002 — gerar_escala_mensal (specs/03-banco/funcoes/fn-002-gerar-escala-mensal.md)
-- ----------------------------------------------------------------------------
-- Transacional, idempotente (RN-05, D-04 em stack.md — "escala materializada,
-- não calculada em tempo de leitura"). Corpo transcrito da spec com três
-- ajustes mínimos para o schema real, registrados em _conflitos.md (item 7),
-- mesmo padrão dos ajustes já feitos em FN-003/FN-005 acima:
--
-- (a) Assinatura: a spec publica `gerar_escala_mensal(p_ciclo_id uuid)`, mas
--     009_rls (limite rígido, `02-seguranca/`, já aplicado por outro agente)
--     faz `ALTER FUNCTION gerar_escala_mensal(uuid, int, int)` — três
--     parâmetros, não um. O header deste arquivo (topo, escrito por outro
--     agente) já avisa que a assinatura precisa bater com 009_rls "ao pé da
--     letra". Resolução: acrescentados `p_ano int DEFAULT NULL, p_mes int
--     DEFAULT NULL` à assinatura para casar com o `ALTER FUNCTION`/`GRANT` de
--     009_rls — mas o CORPO continua ignorando os dois parâmetros e derivando
--     ano/mês de `v_ciclo.ano`/`v_ciclo.mes` (lido do próprio ciclo), exatamente
--     como a spec publica. Isso é o ajuste menos invasivo possível: satisfaz a
--     assinatura exigida por 009_rls sem inventar comportamento nem alterar a
--     lógica publicada. Os `DEFAULT NULL` também mantêm compatível a chamada
--     de 1 argumento `gerar_escala_mensal(id)` que `API-ADM-CIC-003` publica
--     (resolução de overload do Postgres aceita menos argumentos quando os
--     finais têm default).
--
-- (b) Coluna `turno`: a spec publica `INSERT INTO escala_dia (..., turno,
--     codigo, ...) SELECT ..., COALESCE(t.turno, c.turno_padrao), 'D', ...`,
--     mas `escala_dia` (prisma/schema.prisma, migration 003_tabelas) não tem
--     coluna `turno` nem `codigo` — mesma divergência de fundo já documentada
--     nos itens 4/5 (specs escritas contra um esboço de schema anterior à
--     normalização de `codigo_escala`/estrutura final). `escala_dia` também
--     não modela turno por linha; o turno mora só em `plantao.tipo` e em
--     `colaborador.turno_padrao`/`troca_escala.turno`. Resolução: a coluna
--     `turno` foi removida da lista do INSERT (nada no schema para gravá-la);
--     `codigo` foi trocado por `codigo_escala_id`, resolvido via
--     `v_codigo_d_id` (busca única do id do código 'D' antes do laço, mesmo
--     padrão de resolução por FK já usado em FN-003/FN-005). Nenhuma regra de
--     RN-02..05 depende do turno ser gravado em `escala_dia` — a paridade e a
--     data continuam vindo exclusivamente da âncora, como a spec descreve.
--
-- (c) `c.escala_ancora IS NOT NULL AND c.turno_padrao IS NOT NULL`: no schema
--     real ambas as colunas são `NOT NULL` (migration 003_tabelas: `turno_padrao
--     turno NOT NULL`, `escala_ancora date NOT NULL`) — logo um colaborador
--     "sem âncora" (teste F2-7, e `motivo: 'SEM_ANCORA'` em
--     API-ADM-CIC-003) não pode existir fisicamente na base atual. Os
--     predicados foram mantidos ao pé da letra (são inofensivos — sempre
--     verdadeiros contra o schema atual, `CREATE FUNCTION` aceita
--     normalmente) porque removê-los seria "simplificar" a spec, não só
--     ajustar a um schema divergente. F2-7 fica sinalizado como não
--     exercitável neste schema — ver _conflitos.md item 7(c).
--
-- Nenhuma outra coluna/tabela referenciada diverge do schema real (ciclo,
-- colaborador, troca_escala conferem no nome e no tipo).
CREATE OR REPLACE FUNCTION gerar_escala_mensal(
  p_ciclo_id uuid, p_ano int DEFAULT NULL, p_mes int DEFAULT NULL
) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  v_ciclo ciclo%ROWTYPE; v_inicio date; v_fim date; v_criados int := 0;
  v_codigo_d_id uuid;
BEGIN
  SELECT * INTO v_ciclo FROM ciclo WHERE id = p_ciclo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CICLO_INEXISTENTE'; END IF;
  IF v_ciclo.status = 'FECHADO' THEN RAISE EXCEPTION 'CICLO_FECHADO'; END IF;

  -- Ajuste (b): 'D' não é literal gravável direto — resolve o id do código
  -- via codigo_escala antes do laço (mesma resolução por FK de FN-003/FN-005).
  SELECT id INTO v_codigo_d_id FROM codigo_escala WHERE codigo = 'D' AND ativo LIMIT 1;

  v_inicio := make_date(v_ciclo.ano, v_ciclo.mes, 1);
  v_fim := (v_inicio + interval '1 month - 1 day')::date;

  INSERT INTO escala_dia
    (id, ciclo_id, colaborador_id, data, codigo_escala_id, hora_inicio, hora_fim, inicio_em, fim_em)
  SELECT gen_random_uuid(), p_ciclo_id, c.id, d::date,
         v_codigo_d_id,
         c.escala_hora_inicio, c.escala_hora_fim,
         now(), now()                                   -- trigger FN-001 sobrescreve
    FROM colaborador c
    CROSS JOIN generate_series(v_inicio, v_fim, interval '1 day') d
    LEFT JOIN LATERAL (
      SELECT * FROM troca_escala te
       WHERE te.colaborador_id = c.id AND te.vigencia_inicio <= d::date
       ORDER BY te.vigencia_inicio DESC LIMIT 1
    ) t ON true
   WHERE c.ativo AND c.escala_ancora IS NOT NULL AND c.turno_padrao IS NOT NULL
     AND ((d::date - COALESCE(t.ancora, c.escala_ancora))
          % COALESCE(t.periodo, c.escala_periodo)
          + COALESCE(t.periodo, c.escala_periodo))
          % COALESCE(t.periodo, c.escala_periodo) = 0
  ON CONFLICT (colaborador_id, data) DO NOTHING;

  GET DIAGNOSTICS v_criados = ROW_COUNT;
  UPDATE ciclo SET escala_gerada_em = now() WHERE id = p_ciclo_id;
  RETURN v_criados;
END $$;

-- ----------------------------------------------------------------------------
-- FN-006 — cancelar_extra (specs/03-banco/funcoes/fn-006-cancelar-extra.md)
-- ----------------------------------------------------------------------------
-- Transacional (ACID/SEC-ACID, seção "Fronteiras transacionais": "Cancelar
-- extra | FN-006 | update + decrement"). `UPDATE status = 'CANCELADA'`,
-- NUNCA `DELETE` (SEC-CONF: histórico é o produto; `app_server` não tem
-- GRANT DELETE em `marcacao` — ver 009_rls). MESMA ORDEM de `FN-005`
-- (marcar_extra, acima), sem exceção, exatamente como a spec manda ("Marcar
-- e cancelar concorrentes que travassem em ordens diferentes formariam
-- ciclo de deadlock"): advisory lock do colaborador → FOR UPDATE no
-- plantão. É por isso que este comportamento tem que estar aqui, em vez de
-- um trigger em `marcacao` (triggers.md, seção "O que deliberadamente NÃO é
-- trigger": decremento de `vagas_ocupadas` por cancelamento é decisão
-- transacional com lock explícito, não reação automática de linha — um
-- trigger `AFTER UPDATE` não teria como tomar o advisory lock do
-- colaborador *antes* do `FOR UPDATE` do plantão na ordem exigida, e
-- rodaria fora do controle de quem decide se o cancelamento é permitido
-- (janela, ciclo fechado, autorização de ator) — a mesma razão por que
-- `marcar_extra` não é trigger).
--
-- Divergência entre a spec e o schema real encontrada e corrigida —
-- registrada em _conflitos.md (item 8), mesmo padrão dos ajustes já feitos
-- em FN-002/FN-003/FN-005 acima: resolução mínima só para manter a
-- migration aplicável, lógica de negócio preservada ao pé da letra.
--
-- Assinatura: a seção "Assinatura" da spec publica `cancelar_extra(
-- p_marcacao_id uuid, p_ator_tipo text, p_ator_id uuid, p_ip text,
-- p_user_agent text)` — 5 parâmetros. Mas 009_rls (limite rígido,
-- `02-seguranca/`, já aplicado por outro agente, e o próprio header deste
-- arquivo, escrito por outro agente, avisa que a assinatura precisa bater
-- "ao pé da letra") faz `ALTER FUNCTION cancelar_extra(uuid, uuid, text)` e
-- `GRANT EXECUTE ON FUNCTION cancelar_extra(uuid, uuid, text) TO
-- app_server` — só 3 parâmetros, tipos (uuid, uuid, text), sem espaço para
-- `p_ip`/`p_user_agent`. Mesma causa raiz do item 7(a) (FN-002): duas specs
-- `PRONTA` (`FN-006` e `02-seguranca/rls-policies.md` já materializada em
-- 009_rls) se contradizem quanto à aridade; não é decisão que este agente
-- deva tomar sozinho (AGENTS.md item 2), mas sem ajuste a migration não
-- aplica (MG-3). Resolução aplicada (mínima, sem inventar comportamento):
-- assinatura reduzida para `cancelar_extra(p_marcacao_id uuid, p_ator_id
-- uuid, p_ator_tipo text)`, casando exatamente com o `ALTER
-- FUNCTION`/`GRANT` de 009_rls por posição e tipo. `p_ip`/`p_user_agent`
-- foram removidos da assinatura (não cabem nos 3 parâmetros que 009_rls já
-- fixou) — o mesmo raciocínio do item 6 (FN-005) já apontava que
-- `ip`/`user_agent` não são gravados dentro da função de qualquer forma
-- (tabela `marcacao` não tem essas colunas); aqui o chamador que grava
-- `audit_log` na mesma transação (ACID/AUD-2) já tem `ip`/`user_agent` à
-- mão na própria requisição, sem precisar recebê-los de volta desta
-- função. `p_ator_id`/`p_ator_tipo` (textos 'COLABORADOR'/'ADMIN', mesmos
-- valores de `origem_marcacao`, mas parâmetro `text` como o `ALTER
-- FUNCTION` de 009_rls exige — não o enum) são o mínimo necessário para a
-- tabela de autorização da spec ("Colaborador: própria marcação, ciclo
-- PUBLICADO, antes do fechamento" / "Admin: qualquer marcação de ciclo não
-- FECHADO"). Nenhuma outra coluna/tabela referenciada no corpo diverge do
-- schema real (`marcacao.status`/`marcacao.cancelado_em`,
-- `plantao.vagas_ocupadas`, `ciclo.status`/`ciclo.fechamento_marcacao`
-- conferem no nome e no tipo).
CREATE OR REPLACE FUNCTION cancelar_extra(
  p_marcacao_id uuid, p_ator_id uuid, p_ator_tipo text
) RETURNS marcacao LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_marc marcacao%ROWTYPE; v_plantao plantao%ROWTYPE; v_ciclo ciclo%ROWTYPE;
BEGIN
  -- 0. localizar a marcação, sem lock ainda — precisa do colaborador_id
  -- para saber a chave do advisory lock (mesma ordem de FN-005: o lock por
  -- colaborador é sempre o primeiro lock tomado, e só existe depois de
  -- sabermos de qual colaborador se trata).
  SELECT * INTO v_marc FROM marcacao WHERE id = p_marcacao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MARCACAO_INEXISTENTE'; END IF;

  -- Colaborador tentando cancelar marcação de terceiro: 404, não 403
  -- (SEC-CONF — não vaza a existência da marcação alheia). Admin não tem
  -- essa restrição (tabela de autorização da spec).
  IF p_ator_tipo = 'COLABORADOR' AND v_marc.colaborador_id <> p_ator_id THEN
    RAISE EXCEPTION 'MARCACAO_INEXISTENTE';
  END IF;

  -- 1. advisory lock do colaborador — SEMPRE primeiro (SEC-ACID), mesma
  -- ordem de marcar_extra, para não formar deadlock com um marcar_extra
  -- concorrente do mesmo colaborador.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_marc.colaborador_id::text, 0));

  -- 2. plantao FOR UPDATE.
  SELECT * INTO v_plantao FROM plantao WHERE id = v_marc.plantao_id FOR UPDATE;

  -- Re-lê a marcação já sob o advisory lock: outro cancelamento concorrente
  -- pode ter comitado entre o passo 0 (sem lock) e a aquisição do lock
  -- acima — sem isso o UPDATE abaixo poderia decrementar o contador duas
  -- vezes para o mesmo cancelamento em corrida.
  SELECT * INTO v_marc FROM marcacao WHERE id = p_marcacao_id;

  -- Idempotente: já cancelada → retorna a linha como está, sem decrementar
  -- de novo (F6-2: duplo clique não decrementa duas vezes nem lança erro).
  IF v_marc.status = 'CANCELADA' THEN RETURN v_marc; END IF;

  -- 3. ciclo: admin pode cancelar de qualquer ciclo não FECHADO.
  SELECT * INTO v_ciclo FROM ciclo WHERE id = v_plantao.ciclo_id;
  IF v_ciclo.status = 'FECHADO' THEN RAISE EXCEPTION 'CICLO_FECHADO'; END IF;

  -- 4. janela: só colaborador é barrado após o fechamento (admin ignora a
  -- janela, mesma regra RN-27 já aplicada em marcar_extra).
  IF p_ator_tipo = 'COLABORADOR' AND v_ciclo.fechamento_marcacao IS NOT NULL
     AND now() > v_ciclo.fechamento_marcacao THEN
    RAISE EXCEPTION 'JANELA_ENCERRADA';
  END IF;

  -- 5. UPDATE + decrement, mesma transação (ACID — A). Nunca DELETE
  -- (SEC-CONF).
  UPDATE marcacao SET status = 'CANCELADA', cancelado_em = now()
   WHERE id = p_marcacao_id
   RETURNING * INTO v_marc;

  UPDATE plantao SET vagas_ocupadas = vagas_ocupadas - 1 WHERE id = v_marc.plantao_id;

  RETURN v_marc;
END $$;

-- ----------------------------------------------------------------------------
-- FN-007 — plantoes_para_colaborador (specs/03-banco/funcoes/fn-007-plantoes-para-colaborador.md)
-- ----------------------------------------------------------------------------
-- Leitura, STABLE, sem efeito colateral (RN-18..RN-22). "Grade avaliada com
-- motivo": para cada plantão ativo do ciclo, aplica a MESMA ordem de
-- avaliação de `marcar_extra` (FN-005, acima) — a própria spec exige isso
-- ao pé da letra ("Idêntica à de FN-005. Se divergirem, a UI mostra um
-- motivo e a marcação recusa por outro — o pior tipo de bug de confiança"):
--   JA_MARCADO → CRUZADA_BLOQUEADA → EM_AUSENCIA → CONFLITO_DE_HORARIO
--   → EXCEDE_JORNADA → LIMITE_ATINGIDO → SEM_VAGA → (disponível)
-- CONFLITO_DE_HORARIO/EXCEDE_JORNADA vêm da mesma chamada a
-- `valida_descanso` (FN-004) que `marcar_extra` usa no passo 8 — não uma
-- reimplementação paralela da regra, para não poder divergir (F7-8).
-- `LIMITE_ATINGIDO` é calculado uma vez, fora do laço de plantões (nota da
-- spec — evita reconsultar `marcacao`/`participacao_ciclo` ~50x por chamada).
--
-- A spec (`fn-007-plantoes-para-colaborador.md`) publica só a assinatura, a
-- ordem dos motivos e as notas — não um corpo SQL literal como FN-002/003/
-- 005/006 (conferido: nenhuma seção "Implementação" no arquivo). O rascunho
-- em `specs/_arquivo/documento-base.md` §5.5 tem uma função homônima, mas é
-- só um esqueleto comentado (corpo é um comentário SQL, não código executável)
-- e, mais importante, publica uma ORDEM DE MOTIVOS DIFERENTE (`JA_MARCADO →
-- SEM_VAGA → CRUZADA_BLOQUEADA → ...`, `SEM_VAGA` em segundo lugar) da spec
-- `PRONTA` atual (`SEM_VAGA` por último, "de propósito"). `documento-base.md`
-- é material arquivado/anterior (mesma fonte já apontada como desatualizada
-- nos itens 4/5/7/8 de `_conflitos.md`, escrita contra um esboço de schema
-- anterior); a spec `fn-007-*.md`, `PRONTA` e explícita sobre a ordem, é a
-- autoridade seguida aqui — não é ambiguidade a resolver, é a mesma spec
-- dizendo "siga FN-005", e o corpo abaixo é literalmente o de FN-005 (acima,
-- nesta mesma migration) rearranjado de RAISE EXCEPTION sequencial para
-- motivo-por-linha sem parar no primeiro bloqueio, preservando cada condição
-- exatamente.
--
-- Duas divergências entre a assinatura publicada em fn-007-*.md e o schema
-- real, mesma categoria das já registradas em _conflitos.md (itens 4/5/7/8)
-- — registradas nesta rodada como item 9:
-- (a) `tipo tipo_plantao`: não existe enum `tipo_plantao`; o schema usa
--     `turno` (`enum Turno { DIURNO NOTURNO } @@map("turno")`,
--     `plantao.tipo turno NOT NULL`). Resolvido para `tipo turno`.
-- (b) `rt_codigo text`: `rt` (schema.prisma, migration 003_tabelas) não tem
--     coluna `codigo` — só `id`, `nome`, `ativo`. Resolvido para expor
--     `rt.nome` na coluna de saída `rt_codigo` (nome da coluna do contrato
--     preservado — é o que `04-api/colaborador/*`, consumidor futuro, vai
--     esperar — só a origem do valor muda de uma coluna inexistente para a
--     única coluna de rótulo que `rt` de fato tem).
-- Ver _conflitos.md, item 9, para o registro completo (afeta também FN-009
-- `cobertura_ciclo`, ainda não implementada, que publica os dois mesmos
-- nomes — sinalizado lá para quem pegar aquela função).
--
-- `p.ativo` no filtro do laço: a nota "retorna todos os plantões do ciclo,
-- inclusive bloqueados" refere-se a `disponivel = false` por regra de
-- negócio (RT cruzada, ausência, jornada, limite, vaga) — não a plantões
-- inativos (soft-delete, `plantao.ativo = false`, mesmo campo que
-- `marcar_extra` checa como `PLANTAO_INDISPONIVEL`). Um plantão inativo não
-- é uma célula "bloqueada com motivo" na grade; é um plantão removido, que
-- nem a policy RLS `plantao_leitura_anon` (009_rls) expõe. Mantido `p.ativo`
-- no filtro, mesmo critério da policy pública.
CREATE OR REPLACE FUNCTION plantoes_para_colaborador(
  p_ciclo_id uuid, p_colaborador_id uuid
) RETURNS TABLE (
  plantao_id uuid, data date, tipo turno, rt_codigo text,
  hora_inicio text, hora_fim text,
  vagas_totais int, vagas_ocupadas int,
  ja_marcado boolean, disponivel boolean, motivo text
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_colab   colaborador%ROWTYPE;
  v_ciclo   ciclo%ROWTYPE;
  v_part    participacao_ciclo%ROWTYPE;
  v_limite  int;
  v_usadas  int;
  v_limite_atingido boolean;
  v_p       record;
  v_cruzada boolean;
  v_escala_codigo text;
  v_erro    text;
  v_motivo  text;
BEGIN
  SELECT * INTO v_colab FROM colaborador WHERE id = p_colaborador_id;
  SELECT * INTO v_ciclo FROM ciclo WHERE id = p_ciclo_id;
  SELECT * INTO v_part FROM participacao_ciclo
   WHERE ciclo_id = p_ciclo_id AND colaborador_id = p_colaborador_id;

  -- LIMITE_ATINGIDO: calculado uma vez, fora do laço (nota da spec).
  v_limite := COALESCE(v_part.limite_override, v_ciclo.limite_padrao);
  SELECT count(*) INTO v_usadas
    FROM marcacao m JOIN plantao p ON p.id = m.plantao_id
   WHERE m.colaborador_id = p_colaborador_id AND m.status = 'CONFIRMADA'
     AND p.ciclo_id = p_ciclo_id;
  v_limite_atingido := v_usadas >= v_limite;

  FOR v_p IN
    SELECT p.id, p.data, p.tipo, p.rt_id, p.hora_inicio, p.hora_fim,
           p.inicio_em, p.fim_em, p.vagas_totais, p.vagas_ocupadas,
           p.permite_cruzada, rt.nome AS rt_nome
      FROM plantao p JOIN rt ON rt.id = p.rt_id
     WHERE p.ciclo_id = p_ciclo_id AND p.ativo
     ORDER BY p.data, p.hora_inicio
  LOOP
    v_motivo := NULL;

    -- 1. JA_MARCADO — vence todos os outros motivos (a UI já mostra a
    -- marcação existente; não faz sentido também dizer "bloqueado").
    IF EXISTS (
      SELECT 1 FROM marcacao m
       WHERE m.plantao_id = v_p.id AND m.colaborador_id = p_colaborador_id
         AND m.status = 'CONFIRMADA'
    ) THEN
      plantao_id := v_p.id; data := v_p.data; tipo := v_p.tipo;
      rt_codigo := v_p.rt_nome;
      hora_inicio := v_p.hora_inicio::text; hora_fim := v_p.hora_fim::text;
      vagas_totais := v_p.vagas_totais; vagas_ocupadas := v_p.vagas_ocupadas;
      ja_marcado := true; disponivel := false; motivo := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- 2. CRUZADA_BLOQUEADA (mesma precedência de marcar_extra passo 6:
    -- participacao_ciclo → plantao → ciclo → false, RN-20).
    v_cruzada := v_p.rt_id <> v_colab.rt_id;
    IF v_cruzada AND NOT COALESCE(
         v_part.permite_cruzada, v_p.permite_cruzada, v_ciclo.permite_cruzada, false)
    THEN
      v_motivo := 'CRUZADA_BLOQUEADA';
    END IF;

    -- 3. EM_AUSENCIA (mesmo JOIN por codigo_escala_id do passo 7 de
    -- marcar_extra — ver comentário no item 5 de _conflitos.md).
    IF v_motivo IS NULL THEN
      SELECT ce.codigo INTO v_escala_codigo
        FROM escala_dia e JOIN codigo_escala ce ON ce.id = e.codigo_escala_id
       WHERE e.colaborador_id = p_colaborador_id AND e.data = v_p.data;
      IF FOUND AND v_escala_codigo <> 'D' AND NOT v_ciclo.permite_extra_em_folga THEN
        v_motivo := 'EM_AUSENCIA';
      END IF;
    END IF;

    -- 4/5. CONFLITO_DE_HORARIO / EXCEDE_JORNADA — mesma chamada a
    -- valida_descanso (FN-004) que marcar_extra usa no passo 8 (F7-8: motivo
    -- aqui e erro de FN-005 nascem da mesma função, não podem divergir).
    IF v_motivo IS NULL THEN
      v_erro := valida_descanso(p_colaborador_id, v_p.inicio_em, v_p.fim_em,
                                v_ciclo.max_blocos_seguidos);
      IF v_erro IS NOT NULL THEN v_motivo := v_erro; END IF;
    END IF;

    -- 6. LIMITE_ATINGIDO — valor pré-calculado fora do laço.
    IF v_motivo IS NULL AND v_limite_atingido THEN
      v_motivo := 'LIMITE_ATINGIDO';
    END IF;

    -- 7. SEM_VAGA — por último de propósito (nota da spec: "estaria
    -- liberado, mas lotou" é mais útil do que a célula sumir).
    IF v_motivo IS NULL AND v_p.vagas_ocupadas >= v_p.vagas_totais THEN
      v_motivo := 'SEM_VAGA';
    END IF;

    plantao_id := v_p.id; data := v_p.data; tipo := v_p.tipo;
    rt_codigo := v_p.rt_nome;
    hora_inicio := v_p.hora_inicio::text; hora_fim := v_p.hora_fim::text;
    vagas_totais := v_p.vagas_totais; vagas_ocupadas := v_p.vagas_ocupadas;
    ja_marcado := false; disponivel := (v_motivo IS NULL); motivo := v_motivo;
    RETURN NEXT;
  END LOOP;

  RETURN;
END $$;

-- ----------------------------------------------------------------------------
-- FN-008 — saldo_colaborador (specs/03-banco/funcoes/fn-008-saldo-colaborador.md)
-- ----------------------------------------------------------------------------
-- Leitura, STABLE, sem efeito colateral (RN-20, RN-21). Uma linha por chamada
-- — limite/usadas/restantes/permite_cruzada/bloqueado/motivo_bloqueio do
-- colaborador no ciclo, para o cabeçalho da grade (FN-007 cobre o veredito
-- por plantão; esta função é só o resumo agregado).
--
-- Assinatura publicada na spec (`saldo_colaborador(p_ciclo_id uuid,
-- p_colaborador_id uuid) RETURNS TABLE (...)`) bate, sem ajuste, contra o
-- schema real e contra 009_rls/008_roles_grants: não há `ALTER FUNCTION`/
-- `GRANT EXECUTE` nomeando `saldo_colaborador` em nenhuma das duas migrations
-- (conferido nesta rodada) — ao contrário de marcar_extra/cancelar_extra/
-- gerar_escala_mensal (itens 7/8 de _conflitos.md), não há aridade travada
-- por outro agente para esta função. Nenhuma divergência nova encontrada
-- (nomes de coluna/tabela usados abaixo — `ciclo.limite_padrao`,
-- `ciclo.permite_cruzada`, `participacao_ciclo.limite_override/
-- permite_cruzada/bloqueado/motivo`, `marcacao.status`/`colaborador_id`,
-- `plantao.ciclo_id` — todos conferidos contra `prisma/schema.prisma`,
-- batem exatamente com os nomes publicados na spec).
--
-- `LEFT JOIN participacao_ciclo`: colaborador pode não ter linha de
-- participação no ciclo (não é obrigatória — só existe quando o admin criou
-- um override); nesse caso `limite_override`/`permite_cruzada`/`motivo` são
-- NULL (resolvidos pelos COALESCE já exigidos pela spec) e `bloqueado`
-- resolve para `false` (COALESCE explícito abaixo — sem participação, nada
-- bloqueou o colaborador).
--
-- `usadas`: LEFT JOIN LATERAL com COALESCE(…, 0) em vez de subquery direta
-- no SELECT — mesmo resultado, filtro idêntico ao "usadas" de
-- `plantoes_para_colaborador` (FN-007, acima: `status = 'CONFIRMADA'` +
-- `plantao.ciclo_id = p_ciclo_id`, mesma junção `marcacao ⋈ plantao`) para
-- não poder divergir entre as duas funções de leitura (mesmo cuidado do
-- item F7-8/valida_descanso compartilhada). `CANCELADA` não conta (F8-4);
-- marcação de outro ciclo não conta porque o filtro é por
-- `plantao.ciclo_id`, não por `marcacao.colaborador_id` isolado (F8-5).
--
-- `restantes = GREATEST(limite - usadas, 0)`: nunca negativo mesmo quando o
-- admin reduz `limite_override` abaixo do que já foi marcado (F8-3) — nota
-- literal da spec, marcações existentes continuam válidas.
CREATE OR REPLACE FUNCTION saldo_colaborador(
  p_ciclo_id uuid, p_colaborador_id uuid
) RETURNS TABLE (
  limite int, usadas int, restantes int,
  permite_cruzada boolean, bloqueado boolean, motivo_bloqueio text
) LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(part.limite_override, c.limite_padrao)::int AS limite,
    COALESCE(u.usadas, 0)::int AS usadas,
    GREATEST(COALESCE(part.limite_override, c.limite_padrao) - COALESCE(u.usadas, 0), 0)::int AS restantes,
    COALESCE(part.permite_cruzada, c.permite_cruzada, false) AS permite_cruzada,
    COALESCE(part.bloqueado, false) AS bloqueado,
    part.motivo AS motivo_bloqueio
    FROM ciclo c
    LEFT JOIN participacao_ciclo part
      ON part.ciclo_id = c.id AND part.colaborador_id = p_colaborador_id
    LEFT JOIN LATERAL (
      SELECT count(*) AS usadas
        FROM marcacao m
        JOIN plantao p ON p.id = m.plantao_id
       WHERE m.colaborador_id = p_colaborador_id
         AND m.status = 'CONFIRMADA'
         AND p.ciclo_id = c.id
    ) u ON true
   WHERE c.id = p_ciclo_id;
$$;

-- ----------------------------------------------------------------------------
-- FN-009 — cobertura_ciclo (specs/03-banco/funcoes/fn-009-cobertura-ciclo.md)
-- ----------------------------------------------------------------------------
-- Leitura, STABLE, sem efeito colateral (DOM-003.4). Relatório "dias abaixo
-- da cobertura mínima": uma linha por (dia, RT ativa, turno) do mês do ciclo,
-- com escalados/extras/total/minimo/deficit. Alimenta API-ADM-CIC-008.
--
-- Duas divergências entre a assinatura publicada na spec e o schema real,
-- mesma categoria dos itens 4/5/7/8/9 de _conflitos.md — item 9 (agente G7,
-- FN-007) já tinha sinalizado que FN-009 herdaria o mesmo problema; a
-- resolução abaixo é literalmente a mesma que FN-007 aplicou (ver comentário
-- daquela função, acima nesta migration), reaproveitada sem redescobrir:
-- (a) `turno tipo_plantao` → não existe enum `tipo_plantao`; resolvido para
--     `turno turno` (mesmo enum que `plantao.tipo`).
-- (b) `rt_codigo text` lido de `rt.codigo` → `rt` não tem coluna `codigo`;
--     resolvido para expor `rt.nome` na coluna de saída `rt_codigo` (nome do
--     contrato preservado, origem do valor ajustada).
--
-- Terceira divergência, NOVA nesta rodada — registrada em _conflitos.md como
-- item 10 (agente G9, Onda 1): a spec lê "minimo vem da configuração da RT
-- (`rt.cobertura_minima_diurno` / `_noturno`)", mas `rt` (prisma/schema.prisma,
-- migration 003_tabelas) não tem, e nunca teve em nenhuma migration aplicada
-- até aqui, essas duas colunas — nem qualquer outra fonte de "mínimo de
-- cobertura" existe em todo o schema (conferido: nenhuma tabela/coluna com
-- "cobertura" ou "minimo" no nome fora deste comentário e do texto das
-- specs). Ao contrário dos itens 4/5/7/8/9 (nome de coluna/tipo errado, com
-- equivalente correto disponível no schema para substituir), aqui não há
-- NADA para adaptar: sem uma coluna de mínimo configurável por RT/turno, a
-- função não tem como calcular `deficit` (RETORNARIA sempre `minimo = NULL`,
-- quebrando os testes de aceitação F9-1..F9-5 publicados na própria spec, que
-- exigem `deficit` sensível ao mínimo configurado — "Definição de pronto"
-- em AGENTS.md exige que os testes passem). Diferente de simplificar/inventar
-- comportamento de negócio (o que os limites rígidos proíbem), isto é
-- adicionar a MENOR peça de configuração que a própria spec `PRONTA` já
-- nomeia explicitamente pelo nome exato de coluna que espera — sem isso a
-- spec é impossível de implementar no schema atual. Resolução aplicada:
-- `ALTER TABLE rt` adiciona as duas colunas, com `DEFAULT 0` (não quebra
-- nenhuma linha de `rt` já inserida por outra migration/fixture — cobertura
-- mínima zero é neutra: nunca gera déficit até o admin configurar um valor
-- real, mesma lógica do resto do domínio de "sem configuração = sem
-- restrição adicional", ver `permite_cruzada`/
-- `permite_extra_em_folga` em `ciclo`). `prisma/schema.prisma` (model `Rt`)
-- foi atualizado no mesmo commit para refletir as duas colunas novas.
ALTER TABLE rt
  ADD COLUMN cobertura_minima_diurno  int NOT NULL DEFAULT 0,
  ADD COLUMN cobertura_minima_noturno int NOT NULL DEFAULT 0;

-- Corpo: uma varredura por (dia do mês do ciclo) × (RT ativa) × (turno D/N).
-- `escalados`: escala_dia com código de presenca = true (DOM-003.4), turno
-- efetivo do colaborador naquele dia resolvido via troca_escala vigente na
-- data — mesma resolução LATERAL que FN-002 (gerar_escala_mensal, acima
-- nesta migration) já usa para achar o turno efetivo por dia (troca_escala
-- não tem uma coluna "turno do dia" direta; é o turno mais recente com
-- vigencia_inicio <= data). `extras`: marcacao CONFIRMADA cujo plantao cai
-- no mesmo (data, rt_id, tipo) — mesmo filtro de status usado por FN-007/
-- FN-008 (CANCELADA não conta, F9-5). `deficit = GREATEST(minimo - total, 0)`
-- ao pé da letra da spec.
CREATE OR REPLACE FUNCTION cobertura_ciclo(p_ciclo_id uuid)
RETURNS TABLE (
  data date, rt_codigo text, turno turno,
  escalados int, extras int, total int, minimo int, deficit int
) LANGUAGE sql STABLE AS $$
  WITH c AS (
    SELECT * FROM ciclo WHERE id = p_ciclo_id
  ),
  dias AS (
    SELECT gs::date AS data
      FROM c,
           generate_series(
             make_date(c.ano, c.mes, 1),
             (make_date(c.ano, c.mes, 1) + interval '1 month - 1 day')::date,
             interval '1 day'
           ) gs
  ),
  slots AS (
    SELECT d.data, r.id AS rt_id, r.nome AS rt_nome, trn.turno,
           CASE trn.turno
             WHEN 'DIURNO' THEN r.cobertura_minima_diurno
             ELSE r.cobertura_minima_noturno
           END AS minimo
      FROM dias d
      CROSS JOIN rt r
      CROSS JOIN unnest(enum_range(NULL::turno)) AS trn(turno)
     WHERE r.ativo
  ),
  escalados AS (
    SELECT e.data, col.rt_id,
           COALESCE(t.turno, col.turno_padrao) AS turno,
           count(*) AS n
      FROM escala_dia e
      JOIN colaborador col ON col.id = e.colaborador_id
      JOIN codigo_escala ce ON ce.id = e.codigo_escala_id
      LEFT JOIN LATERAL (
        SELECT te.turno FROM troca_escala te
         WHERE te.colaborador_id = col.id AND te.vigencia_inicio <= e.data
         ORDER BY te.vigencia_inicio DESC LIMIT 1
      ) t ON true
     WHERE e.ciclo_id = p_ciclo_id AND ce.presenca
     GROUP BY e.data, col.rt_id, COALESCE(t.turno, col.turno_padrao)
  ),
  extras AS (
    SELECT p.data, p.rt_id, p.tipo AS turno, count(*) AS n
      FROM marcacao m
      JOIN plantao p ON p.id = m.plantao_id
     WHERE p.ciclo_id = p_ciclo_id AND m.status = 'CONFIRMADA'
     GROUP BY p.data, p.rt_id, p.tipo
  )
  SELECT
    s.data,
    s.rt_nome AS rt_codigo,
    s.turno,
    COALESCE(esc.n, 0)::int AS escalados,
    COALESCE(ex.n, 0)::int AS extras,
    (COALESCE(esc.n, 0) + COALESCE(ex.n, 0))::int AS total,
    s.minimo::int AS minimo,
    GREATEST(s.minimo - (COALESCE(esc.n, 0) + COALESCE(ex.n, 0)), 0)::int AS deficit
    FROM slots s
    LEFT JOIN escalados esc
      ON esc.data = s.data AND esc.rt_id = s.rt_id AND esc.turno = s.turno
    LEFT JOIN extras ex
      ON ex.data = s.data AND ex.rt_id = s.rt_id AND ex.turno = s.turno
   ORDER BY s.data, s.rt_nome, s.turno;
$$;

-- ============================================================================
-- Sanidade final do arquivo (agente G9, Onda 1, última função da onda de
-- banco de dados) — conferido nesta rodada, arquivo inteiro, ponta a ponta:
--
-- - As 8 funções da lista do cabeçalho (FN-002..FN-009) estão presentes,
--   cada uma exatamente uma vez (`grep -n "^CREATE OR REPLACE FUNCTION"`:
--   blocos_ocupados, valida_descanso, marcar_extra, gerar_escala_mensal,
--   cancelar_extra, plantoes_para_colaborador, saldo_colaborador,
--   cobertura_ciclo — 8 linhas, sem repetição de nome).
-- - Nenhum placeholder/stub (`TODO`, `RAISE NOTICE 'not implemented'`, corpo
--   vazio) restante — cada função tem corpo completo.
-- - Delimitadores de dollar-quoting (`$$`) balanceados: 16 ocorrências reais
--   de código (2 por função × 8 funções, abre/fecha), mais 1 ocorrência
--   dentro de comentário de linha (`--`, inofensiva — comentário de linha é
--   descartado pelo lexer antes do parser reconhecer dollar-quoting).
-- - Todo `CREATE OR REPLACE FUNCTION ... $$ ... $$;` termina em `;`; a única
--   instrução fora de função (`ALTER TABLE rt ADD COLUMN ...`, FN-009,
--   acima) também termina em `;`.
-- - Assinaturas conferidas uma última vez contra os consumidores que travam
--   aridade: `marcar_extra(uuid, uuid, origem_marcacao, text, text)`,
--   `cancelar_extra(uuid, uuid, text)`, `gerar_escala_mensal(uuid, int,
--   int)` — todas batem com os `ALTER FUNCTION`/`GRANT EXECUTE` de 009_rls
--   (mesma migrations folder), condição MG-3 do cabeçalho deste arquivo.
-- - `cobertura_ciclo` é a única com efeito colateral fora do próprio corpo
--   de leitura (o `ALTER TABLE rt ADD COLUMN` que a precede, necessário pela
--   divergência registrada em _conflitos.md item 10) — nenhuma outra função
--   desta migration altera schema.
--
-- Nenhuma divergência de sintaxe encontrada. Arquivo válido do início ao fim
-- (não executado neste ambiente — Docker indisponível, ver nota nos arquivos
-- `tests/pgtap/*.pgtap.sql`; validação de sintaxe feita por leitura, não por
-- `psql`/`prisma migrate deploy` real).
-- ============================================================================

