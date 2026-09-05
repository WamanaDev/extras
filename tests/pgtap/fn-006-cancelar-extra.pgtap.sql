-- ============================================================================
-- PENDENTE DE EXECUÇÃO NESTE AMBIENTE (mesma nota de fn-003/fn-004/fn-005.pgtap.sql)
-- ============================================================================
-- Testes pgTAP para specs/03-banco/funcoes/fn-006-cancelar-extra.md (FN-006),
-- seção "Testes de aceitação": F6-1..F6-8. Este ambiente de agente não tem
-- Docker daemon acessível (`docker ps` falhou: "failed to connect to the
-- docker API at npipe:////./pipe/dockerDesktopLinuxEngine") nem
-- `pg_prove`/extensão `pgtap` instalados localmente, então este arquivo NÃO
-- FOI EXECUTADO — escrito e pronto para rodar assim que:
--   1. `docker compose -f docker-compose.dev.yml up -d` subir o Postgres 15
--      local (porta 5432);
--   2. `prisma migrate deploy` tiver aplicado até 20260101000007_funcoes
--      (esta migration, com `cancelar_extra`, `marcar_extra`,
--      `valida_descanso`, `blocos_ocupados` e `gerar_escala_mensal`) e as
--      migrations posteriores necessárias;
--   3. As extensões `pgtap` e `dblink` estiverem instaladas no banco de
--      teste (`CREATE EXTENSION pgtap; CREATE EXTENSION dblink;`), e rodar
--      via `pg_prove -d <db_teste> tests/pgtap/fn-006-cancelar-extra.pgtap.sql`.
--
-- ATENÇÃO — F6-6 exerce a garantia de isolamento ACID sob concorrência REAL
-- (advisory lock por colaborador + FOR UPDATE no plantão nos dois caminhos,
-- marcar e cancelar — SEC-ACID, anomalia A4 de `02-seguranca/acid.md`).
-- Nenhuma ferramenta estática prova isolamento sob concorrência — só
-- execução real, com sessões de banco de fato paralelas (método de
-- TST-002/07-testes/concorrencia.md), prova ou refuta isso. F6-6 PRECISA
-- rodar contra Postgres real (não mock, não SQLite) antes de qualquer
-- deploy que toque `cancelar_extra` ou `marcar_extra`.
--
-- ARQUITETURA DESTE ARQUIVO (mesmo padrão de fn-005-marcar-extra.pgtap.sql):
--   • Parte A (F6-1, F6-2, F6-3, F6-4, F6-5, F6-7, F6-8): sequencial, cada
--     cenário com fixtures de ID próprio, sem necessidade de sessões
--     separadas.
--   • Parte B (F6-6): fixtures comitados, `dblink` abre 2 conexões reais —
--     uma chama `marcar_extra` para um 2º colaborador enquanto a outra
--     chama `cancelar_extra` na marcação do 1º colaborador, ambas no mesmo
--     plantão — resultado avaliado depois que as duas terminam.
-- Nenhum `BEGIN` explícito neste arquivo (autocommit padrão do
-- psql/pg_prove) — necessário para que os fixtures fiquem visíveis para as
-- sessões dblink da Parte B assim que cada `INSERT` retorna (mesma razão já
-- documentada em fn-005-marcar-extra.pgtap.sql). Limpeza explícita por
-- `DELETE` (não `ROLLBACK`) ao final, usando o mesmo prefixo de UUID desta
-- suíte (…-0000-000000060XXX, 06 = FN-006).
--
-- Identificadores: UUIDs literais só com dígitos hexadecimais (0-9a-f),
-- prefixo …-0000-000000060XXX, mesmo cuidado já registrado em
-- fn-004/fn-005.pgtap.sql.
-- ============================================================================

SELECT plan(15);

-- ----------------------------------------------------------------------------
-- Fixtures compartilhados (Parte A e Parte B). Comitados de propósito — ver
-- nota de arquitetura acima.
-- ----------------------------------------------------------------------------
INSERT INTO rt (id, nome) VALUES
  ('00000000-0000-0000-0000-000000060001', 'RT1 FN-006');

-- Ciclo A: publicado, janela aberta.
INSERT INTO ciclo (
  id, ano, mes, status, limite_padrao, permite_cruzada, permite_extra_em_folga,
  max_blocos_seguidos, abertura_marcacao, fechamento_marcacao
) VALUES (
  '00000000-0000-0000-0000-000000060005', 2026, 9, 'PUBLICADO', 5, true, false,
  2, now() - interval '1 day', now() + interval '30 days'
);

-- Ciclo B: publicado, janela JÁ FECHADA (fechamento_marcacao no passado) —
-- para F6-3 (colaborador após fechamento) e F6-4 (admin após fechamento).
INSERT INTO ciclo (
  id, ano, mes, status, limite_padrao, permite_cruzada, permite_extra_em_folga,
  max_blocos_seguidos, abertura_marcacao, fechamento_marcacao
) VALUES (
  '00000000-0000-0000-0000-000000060006', 2026, 10, 'PUBLICADO', 5, true, false,
  2, now() - interval '60 days', now() - interval '1 day'
);

-- Ciclo C: FECHADO — para F6-5.
INSERT INTO ciclo (
  id, ano, mes, status, limite_padrao, permite_cruzada, permite_extra_em_folga,
  max_blocos_seguidos, abertura_marcacao, fechamento_marcacao
) VALUES (
  '00000000-0000-0000-0000-000000060007', 2026, 11, 'FECHADO', 5, true, false,
  2, now() - interval '90 days', now() - interval '60 days'
);

-- ============================================================================
-- PARTE A — sequencial (F6-1, F6-2, F6-3, F6-4, F6-5, F6-7, F6-8)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- F6-1: cancelamento normal → status CANCELADA, contador -1.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000060101', 'MAT9601', 'Colaborador F6-1', 'hash9601', '9601',
          '00000000-0000-0000-0000-000000060001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000060102', '00000000-0000-0000-0000-000000060005',
          '00000000-0000-0000-0000-000000060001', '2026-09-10', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT lives_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000060102'::uuid,
                          '00000000-0000-0000-0000-000000060101'::uuid) $$,
  'F6-1 setup: marcar_extra cria a marcação a cancelar'
);

SELECT is(
  (SELECT vagas_ocupadas FROM plantao WHERE id = '00000000-0000-0000-0000-000000060102'),
  1,
  'F6-1 setup: contador em 1 antes do cancelamento'
);

SELECT lives_ok(
  format(
    $$ SELECT cancelar_extra(
         (SELECT id FROM marcacao WHERE plantao_id = %L AND colaborador_id = %L)::uuid,
         %L::uuid, 'COLABORADOR') $$,
    '00000000-0000-0000-0000-000000060102', '00000000-0000-0000-0000-000000060101',
    '00000000-0000-0000-0000-000000060101'
  ),
  'F6-1: cancelamento normal não lança exceção'
);

SELECT is(
  (SELECT status::text FROM marcacao
    WHERE plantao_id = '00000000-0000-0000-0000-000000060102'
      AND colaborador_id = '00000000-0000-0000-0000-000000060101'),
  'CANCELADA',
  'F6-1: status vira CANCELADA'
);

SELECT is(
  (SELECT vagas_ocupadas FROM plantao WHERE id = '00000000-0000-0000-0000-000000060102'),
  0,
  'F6-1: contador do plantão decrementado de volta para 0'
);

-- ----------------------------------------------------------------------------
-- F6-2: cancelar 2x → idempotente, contador -1 apenas (a marcação de F6-1
-- já está CANCELADA — chama de novo e confere que não decrementa outra vez).
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  format(
    $$ SELECT cancelar_extra(
         (SELECT id FROM marcacao WHERE plantao_id = %L AND colaborador_id = %L)::uuid,
         %L::uuid, 'COLABORADOR') $$,
    '00000000-0000-0000-0000-000000060102', '00000000-0000-0000-0000-000000060101',
    '00000000-0000-0000-0000-000000060101'
  ),
  'F6-2: cancelar marcação já cancelada não lança exceção (idempotente)'
);

SELECT is(
  (SELECT vagas_ocupadas FROM plantao WHERE id = '00000000-0000-0000-0000-000000060102'),
  0,
  'F6-2: contador continua 0 (não decrementou de novo)'
);

-- ----------------------------------------------------------------------------
-- F6-3: colaborador cancelando após o fechamento da janela → JANELA_ENCERRADA.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000060201', 'MAT9602', 'Colaborador F6-3', 'hash9602', '9602',
          '00000000-0000-0000-0000-000000060001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000060202', '00000000-0000-0000-0000-000000060006',
          '00000000-0000-0000-0000-000000060001', '2026-10-10', 'DIURNO', '07:00', '19:00', 12, 5);

-- Marcação inserida diretamente (marcar_extra recusaria por JANELA_ENCERRADA
-- também na criação, já que o ciclo B tem janela fechada) — simula extra
-- marcada enquanto a janela ainda estava aberta.
INSERT INTO marcacao (id, plantao_id, colaborador_id, status, cruzada, origem)
  VALUES ('00000000-0000-0000-0000-000000060203', '00000000-0000-0000-0000-000000060202',
          '00000000-0000-0000-0000-000000060201', 'CONFIRMADA', false, 'COLABORADOR');
UPDATE plantao SET vagas_ocupadas = 1 WHERE id = '00000000-0000-0000-0000-000000060202';

SELECT throws_ok(
  $$ SELECT cancelar_extra('00000000-0000-0000-0000-000000060203'::uuid,
                            '00000000-0000-0000-0000-000000060201'::uuid, 'COLABORADOR') $$,
  'JANELA_ENCERRADA',
  'F6-3: colaborador cancelando após fechamento_marcacao → JANELA_ENCERRADA'
);

-- ----------------------------------------------------------------------------
-- F6-4: admin cancelando a mesma marcação após o fechamento → permitido
-- (admin ignora a janela, mesma regra RN-27 de marcar_extra).
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT cancelar_extra('00000000-0000-0000-0000-000000060203'::uuid,
                            '00000000-0000-0000-0000-000000060201'::uuid, 'ADMIN') $$,
  'F6-4: admin cancelando após fechamento_marcacao → permitido'
);

SELECT is(
  (SELECT vagas_ocupadas FROM plantao WHERE id = '00000000-0000-0000-0000-000000060202'),
  0,
  'F6-4: contador decrementado após cancelamento do admin'
);

-- ----------------------------------------------------------------------------
-- F6-5: ciclo FECHADO → CICLO_FECHADO (mesmo para admin — só a janela é a
-- checagem que admin pula, ciclo fechado bloqueia os dois).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000060301', 'MAT9603', 'Colaborador F6-5', 'hash9603', '9603',
          '00000000-0000-0000-0000-000000060001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000060302', '00000000-0000-0000-0000-000000060007',
          '00000000-0000-0000-0000-000000060001', '2026-11-10', 'DIURNO', '07:00', '19:00', 12, 5);

INSERT INTO marcacao (id, plantao_id, colaborador_id, status, cruzada, origem)
  VALUES ('00000000-0000-0000-0000-000000060303', '00000000-0000-0000-0000-000000060302',
          '00000000-0000-0000-0000-000000060301', 'CONFIRMADA', false, 'COLABORADOR');
UPDATE plantao SET vagas_ocupadas = 1 WHERE id = '00000000-0000-0000-0000-000000060302';

SELECT throws_ok(
  $$ SELECT cancelar_extra('00000000-0000-0000-0000-000000060303'::uuid,
                            '00000000-0000-0000-0000-000000060301'::uuid, 'ADMIN') $$,
  'CICLO_FECHADO',
  'F6-5: ciclo FECHADO → CICLO_FECHADO mesmo para admin'
);

-- ----------------------------------------------------------------------------
-- F6-7: remarcar após cancelar → permitido (o índice único parcial em
-- marcacao só cobre status = 'CONFIRMADA' — SEC-ACID/acid.md).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000060401', 'MAT9604', 'Colaborador F6-7', 'hash9604', '9604',
          '00000000-0000-0000-0000-000000060001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000060402', '00000000-0000-0000-0000-000000060005',
          '00000000-0000-0000-0000-000000060001', '2026-09-20', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT lives_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000060402'::uuid,
                          '00000000-0000-0000-0000-000000060401'::uuid) $$,
  'F6-7 setup: primeira marcação'
);

SELECT lives_ok(
  format(
    $$ SELECT cancelar_extra(
         (SELECT id FROM marcacao WHERE plantao_id = %L AND colaborador_id = %L
            AND status = 'CONFIRMADA')::uuid,
         %L::uuid, 'COLABORADOR') $$,
    '00000000-0000-0000-0000-000000060402', '00000000-0000-0000-0000-000000060401',
    '00000000-0000-0000-0000-000000060401'
  ),
  'F6-7: cancela a primeira marcação'
);

SELECT lives_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000060402'::uuid,
                          '00000000-0000-0000-0000-000000060401'::uuid) $$,
  'F6-7: remarcar o mesmo plantão após cancelar → permitido (índice único é parcial)'
);

-- ----------------------------------------------------------------------------
-- F6-8: colaborador tentando cancelar marcação de terceiro →
-- MARCACAO_INEXISTENTE (404, não 403 — SEC-CONF, não vaza existência).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES
    ('00000000-0000-0000-0000-000000060501', 'MAT9605', 'Colaborador F6-8 dono', 'hash9605', '9605',
     '00000000-0000-0000-0000-000000060001', 'DIURNO', '2026-01-01'),
    ('00000000-0000-0000-0000-000000060502', 'MAT9606', 'Colaborador F6-8 terceiro', 'hash9606', '9606',
     '00000000-0000-0000-0000-000000060001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000060503', '00000000-0000-0000-0000-000000060005',
          '00000000-0000-0000-0000-000000060001', '2026-09-21', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT lives_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000060503'::uuid,
                          '00000000-0000-0000-0000-000000060501'::uuid) $$,
  'F6-8 setup: dono marca a extra'
);

SELECT throws_ok(
  format(
    $$ SELECT cancelar_extra(
         (SELECT id FROM marcacao WHERE plantao_id = %L AND colaborador_id = %L)::uuid,
         %L::uuid, 'COLABORADOR') $$,
    '00000000-0000-0000-0000-000000060503', '00000000-0000-0000-0000-000000060501',
    '00000000-0000-0000-0000-000000060502'
  ),
  'MARCACAO_INEXISTENTE',
  'F6-8: colaborador terceiro tentando cancelar → MARCACAO_INEXISTENTE (não NAO_AUTORIZADO)'
);

-- ============================================================================
-- PARTE B — concorrência real via dblink (F6-6)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS dblink;

-- ----------------------------------------------------------------------------
-- F6-6: marcar + cancelar em paralelo no mesmo plantão → contador bate com a
-- contagem real ao final (T4/A4 de acid.md: `FOR UPDATE` no plantão nos dois
-- caminhos). Plantão com 2 vagas, 1 já ocupada por um colaborador que vai
-- cancelar ao mesmo tempo que um segundo colaborador tenta marcar.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES
    ('00000000-0000-0000-0000-000000060601', 'MAT9607', 'Colaborador F6-6 cancela', 'hash9607', '9607',
     '00000000-0000-0000-0000-000000060001', 'DIURNO', '2026-01-01'),
    ('00000000-0000-0000-0000-000000060602', 'MAT9608', 'Colaborador F6-6 marca', 'hash9608', '9608',
     '00000000-0000-0000-0000-000000060001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000060603', '00000000-0000-0000-0000-000000060005',
          '00000000-0000-0000-0000-000000060001', '2026-09-22', 'DIURNO', '07:00', '19:00', 12, 2);

INSERT INTO marcacao (id, plantao_id, colaborador_id, status, cruzada, origem)
  VALUES ('00000000-0000-0000-0000-000000060604', '00000000-0000-0000-0000-000000060603',
          '00000000-0000-0000-0000-000000060601', 'CONFIRMADA', false, 'COLABORADOR');
UPDATE plantao SET vagas_ocupadas = 1 WHERE id = '00000000-0000-0000-0000-000000060603';

DO $$
BEGIN
  PERFORM dblink_connect('f66_cancela', 'dbname=' || current_database());
  PERFORM dblink_connect('f66_marca', 'dbname=' || current_database());
  PERFORM dblink_send_query('f66_cancela',
    format('SELECT (cancelar_extra(%L::uuid, %L::uuid, ''COLABORADOR'')).id::text',
           '00000000-0000-0000-0000-000000060604', '00000000-0000-0000-0000-000000060601'));
  PERFORM dblink_send_query('f66_marca',
    format('SELECT (marcar_extra(%L::uuid, %L::uuid)).id::text',
           '00000000-0000-0000-0000-000000060603', '00000000-0000-0000-0000-000000060602'));
END $$;

CREATE TEMP TABLE __f66_resultados__ (conn text, ok boolean, erro text);
DO $$
DECLARE
  v_row record;
  v_erro text;
  c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['f66_cancela', 'f66_marca'] LOOP
    BEGIN
      SELECT * INTO v_row FROM dblink_get_result(c) AS t(id text);
      INSERT INTO __f66_resultados__ VALUES (c, true, NULL);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
      INSERT INTO __f66_resultados__ VALUES (c, false, v_erro);
    END;
    PERFORM dblink_disconnect(c);
  END LOOP;
END $$;

-- Ambas devem ter sucesso (colaboradores distintos, cada um pega seu próprio
-- advisory lock — não há disputa de lock entre eles, só disputa no FOR
-- UPDATE do plantão, que serializa os dois UPDATEs sem erro de negócio).
SELECT is(
  (SELECT count(*)::int FROM __f66_resultados__ WHERE ok),
  2,
  'F6-6: cancelar_extra e marcar_extra concorrentes no mesmo plantão, ambos sucesso'
);

SELECT is(
  (SELECT vagas_ocupadas FROM plantao WHERE id = '00000000-0000-0000-0000-000000060603'),
  (SELECT count(*)::int FROM marcacao
    WHERE plantao_id = '00000000-0000-0000-0000-000000060603' AND status = 'CONFIRMADA'),
  'F6-6: vagas_ocupadas bate com a contagem real de marcações CONFIRMADA após a corrida'
);

SELECT * FROM finish();

-- ----------------------------------------------------------------------------
-- Limpeza explícita (não há ROLLBACK — ver nota de arquitetura no topo).
-- Ordem respeita FKs: marcacao → plantao → colaborador/ciclo → rt.
-- ----------------------------------------------------------------------------
DELETE FROM marcacao WHERE colaborador_id IN (
  SELECT id FROM colaborador WHERE rt_id = '00000000-0000-0000-0000-000000060001'
);
DELETE FROM plantao WHERE ciclo_id::text LIKE '00000000-0000-0000-0000-00000006%';
DELETE FROM colaborador WHERE rt_id = '00000000-0000-0000-0000-000000060001';
DELETE FROM ciclo WHERE id::text LIKE '00000000-0000-0000-0000-00000006%';
DELETE FROM rt WHERE id = '00000000-0000-0000-0000-000000060001';

DROP TABLE IF EXISTS __f66_resultados__;
