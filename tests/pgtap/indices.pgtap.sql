-- ============================================================================
-- PENDENTE DE EXECUÇÃO NESTE AMBIENTE
-- ============================================================================
-- Testes pgTAP para specs/03-banco/indices.md (DB-004), tabela "Testes de
-- aceitação" (X1-X4). Este ambiente de agente não tem acesso a uma instância
-- Postgres real: `docker ps` falha ("failed to connect to the docker API...
-- daemon is running?") e não há `pg_prove`/extensão `pgtap` instalada aqui.
-- Este arquivo NÃO FOI EXECUTADO — está escrito e pronto para rodar assim
-- que:
--   1. `prisma/migrations/20260101000001..010` tiverem sido aplicadas por
--      completo, incluindo `004_constraints` e `005_triggers` (em edição por
--      outro agente, em paralelo, no momento em que este arquivo foi
--      escrito) — os triggers `preencher_intervalo` e
--      `copiar_intervalo_marcacao` recalculam `inicio_em`/`fim_em` a partir
--      de `hora_inicio`/`hora_fim`; os valores de seed abaixo para essas
--      colunas são apenas placeholders exigidos pelo tipo da coluna
--      (NOT NULL) e são sobrescritos pelo trigger antes da gravação.
--   2. A extensão `pgtap` estiver instalada no banco de teste
--      (`CREATE EXTENSION pgtap;`), e rodar via
--      `pg_prove -d <db_teste> tests/pgtap/indices.pgtap.sql`.
--   3. Revisar o seed contra `004_constraints`/`005_triggers` finais — se
--      alguma constraint/trigger publicado depois deste arquivo rejeitar um
--      valor de seed (ex.: CHECK de janela de horário, exclusion constraint
--      de sobreposição), ajustar os `INSERT` abaixo, sem mudar as asserções
--      de índice/plano, que são o que a spec pede.
--
-- X1-X4 exigem volume realista (specs/03-banco/indices.md: "15.000 linhas de
-- escala"), então este arquivo semeia dados sintéticos (500 colaboradores x
-- 30 dias = 15.000 linhas de `escala_dia`) dentro da própria transação de
-- teste (BEGIN...ROLLBACK) — nada disso é persistido.
--
-- Os limiares de tempo (X1 "< 10 ms", X2 "< 100 ms") são sensíveis a
-- hardware/CI e não são reproduzíveis de forma determinística fora de um
-- ambiente controlado; por isso X1/X2 aqui verificam a forma do plano (index
-- scan, não seq scan) via EXPLAIN, que é a condição estrutural que a spec
-- realmente está testando (a regra "EXPLAIN (ANALYZE, BUFFERS) antes de
-- adicionar índice" da própria seção "Regras" já cobre a validação de tempo
-- absoluto, feita manualmente contra volume de produção real).
-- ============================================================================

BEGIN;
SELECT plan(4);

-- ----------------------------------------------------------------------------
-- Helper local: devolve o texto do EXPLAIN (ANALYZE, BUFFERS) de uma query.
-- Existe só dentro desta transação de teste (BEGIN...ROLLBACK no fim desfaz).
-- ----------------------------------------------------------------------------
CREATE FUNCTION pg_temp._explain_text(query text) RETURNS text AS $$
DECLARE
  out_text text := '';
  line text;
BEGIN
  FOR line IN EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ' || query LOOP
    out_text := out_text || line || E'\n';
  END LOOP;
  RETURN out_text;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Seed: 500 colaboradores, 1 ciclo, 15.000 linhas de escala_dia (X1), grade
-- de plantões de um ciclo completo (X2) e marcações confirmadas (X3).
-- ----------------------------------------------------------------------------
INSERT INTO rt (id, nome) VALUES ('00000000-0000-0000-0000-0000000000f1', 'RT1');

INSERT INTO codigo_escala (id, codigo, descricao, presenca, ocupa_horario, remunerada, cor)
VALUES ('00000000-0000-0000-0000-0000000000c1', 'D', 'Dia', true, true, true, '#1a1a1a');

INSERT INTO ciclo (id, ano, mes, status, limite_padrao)
VALUES ('00000000-0000-0000-0000-0000000000e1', 2026, 9, 'PUBLICADO', 4);

INSERT INTO colaborador (
  id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id,
  turno_padrao, escala_ancora
)
SELECT
  ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid,
  'M' || lpad(i::text, 6, '0'),
  'Colaborador ' || i,
  'hash' || i,
  lpad((i % 10000)::text, 4, '0'),
  '00000000-0000-0000-0000-0000000000f1',
  'DIURNO',
  DATE '2026-09-01'
FROM generate_series(1, 500) AS i;

-- X1: 500 colaboradores x 30 dias = 15.000 linhas de escala_dia.
INSERT INTO escala_dia (
  id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim
)
SELECT
  gen_random_uuid(),
  ('00000000-0000-0000-0001-' || lpad(colab::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-0000000000c1',
  DATE '2026-09-01' + (dia - 1),
  TIME '07:00:00',
  TIME '19:00:00'
FROM generate_series(1, 500) AS colab, generate_series(1, 30) AS dia;

-- X2: grade de plantões do ciclo completo.
INSERT INTO plantao (
  id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-0000000000f1',
  DATE '2026-09-01' + (dia - 1),
  'DIURNO',
  TIME '07:00:00',
  TIME '19:00:00',
  12,
  3
FROM generate_series(1, 30) AS dia;

-- X3: marcações confirmadas para contagem de cota (uma por colaborador, no primeiro plantão).
INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada)
SELECT
  gen_random_uuid(),
  (SELECT id FROM plantao WHERE ciclo_id = '00000000-0000-0000-0000-0000000000e1' ORDER BY data LIMIT 1),
  ('00000000-0000-0000-0001-' || lpad(colab::text, 12, '0'))::uuid,
  'CONFIRMADA',
  'COLABORADOR',
  false
FROM generate_series(1, 500) AS colab;

ANALYZE escala_dia;
ANALYZE plantao;
ANALYZE marcacao;

-- ----------------------------------------------------------------------------
-- X1: FN-003 com 15.000 linhas de escala → index scan em idx_escala_ocupacao.
-- ----------------------------------------------------------------------------
SELECT ok(
  pg_temp._explain_text(
    $q$ SELECT 1 FROM escala_dia
         WHERE colaborador_id = '00000000-0000-0000-0001-000000000001'
           AND inicio_em < now() AND fim_em > now() $q$
  ) ~ 'Index Scan.*idx_escala_ocupacao',
  'X1: FN-003 (ocupação de escala) usa idx_escala_ocupacao via index scan'
);

-- ----------------------------------------------------------------------------
-- X2: FN-007 (grade de extras) para um ciclo completo → index scan em
-- idx_plantao_ciclo_data.
-- ----------------------------------------------------------------------------
SELECT ok(
  pg_temp._explain_text(
    $q$ SELECT 1 FROM plantao
         WHERE ciclo_id = '00000000-0000-0000-0000-0000000000e1' AND ativo $q$
  ) ~ 'Index Scan.*idx_plantao_ciclo_data',
  'X2: FN-007 (grade do ciclo) usa idx_plantao_ciclo_data via index scan'
);

-- ----------------------------------------------------------------------------
-- X3: contagem de cota (FN-005/FN-008) → index scan em idx_marcacao_colab.
-- ----------------------------------------------------------------------------
SELECT ok(
  pg_temp._explain_text(
    $q$ SELECT count(*) FROM marcacao
         WHERE colaborador_id = '00000000-0000-0000-0001-000000000001'
           AND status = 'CONFIRMADA' $q$
  ) ~ 'Index Scan.*idx_marcacao_colab',
  'X3: contagem de cota usa idx_marcacao_colab via index scan'
);

-- ----------------------------------------------------------------------------
-- X4: nenhum seq scan nas tabelas > 5.000 linhas (escala_dia = 15.000) para
-- os caminhos críticos acima.
-- ----------------------------------------------------------------------------
SELECT ok(
  pg_temp._explain_text(
    $q$ SELECT 1 FROM escala_dia
         WHERE colaborador_id = '00000000-0000-0000-0001-000000000001'
           AND inicio_em < now() AND fim_em > now() $q$
  ) !~ 'Seq Scan on escala_dia',
  'X4: caminho crítico de FN-003 não faz seq scan em escala_dia (> 5.000 linhas)'
);

SELECT * FROM finish();
ROLLBACK;
