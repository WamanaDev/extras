-- ============================================================================
-- PENDENTE DE EXECUÇÃO NESTE AMBIENTE (mesma nota de rls-policies.pgtap.sql)
-- ============================================================================
-- Testes pgTAP para specs/03-banco/constraints.md (DB-002), seção "Testes de
-- aceitação (pgTAP)": B1-B8. Este ambiente de agente não tem Docker daemon
-- acessível (`docker info` falha: "failed to connect to the docker API") nem
-- `pg_prove`/extensão `pgtap` instalados localmente, então este arquivo NÃO
-- FOI EXECUTADO — escrito e pronto para rodar assim que:
--   1. `docker compose -f docker-compose.dev.yml up -d` subir o Postgres 15
--      local (porta 5432);
--   2. `prisma migrate deploy` (ou `dev`) tiver aplicado até
--      20260101000005_triggers (as duas migrations que este arquivo exercita:
--      004_constraints e, indiretamente via preencher_intervalo, 005_triggers
--      — os testes de sobreposição de intervalo dependem de inicio_em/fim_em
--      estarem preenchidos corretamente);
--   3. A extensão `pgtap` estiver instalada no banco de teste
--      (`CREATE EXTENSION pgtap;`), e rodar via
--      `pg_prove -d <db_teste> tests/pgtap/constraints.pgtap.sql`.
--
-- Cobre B1-B8 na mesma ordem da tabela de constraints.md.
-- ============================================================================

BEGIN;
SELECT plan(8);

-- Fixtures compartilhadas: uma RT, um código de escala, um colaborador, um
-- ciclo e um plantão-base para os testes que precisam de FK válida.
INSERT INTO rt (id, nome) VALUES ('00000000-0000-0000-0000-0000000000f1', 'RT Teste');
INSERT INTO codigo_escala (id, codigo, descricao, presenca, ocupa_horario, remunerada, cor)
  VALUES ('00000000-0000-0000-0000-0000000000f2', 'T', 'Trabalho', true, true, true, '#000000');
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-0000000000f3', 'MAT001', 'Fulano', 'hash', '1234',
          '00000000-0000-0000-0000-0000000000f1', 'DIURNO', '2026-01-01');
INSERT INTO ciclo (id, ano, mes, limite_padrao)
  VALUES ('00000000-0000-0000-0000-0000000000f4', 2026, 9, 5);
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f4',
          '00000000-0000-0000-0000-0000000000f1', '2026-09-04', 'DIURNO', '07:00', '19:00', 12, 1);

-- B1: vagas_ocupadas = vagas_totais + 1 é rejeitado (chk_vagas).
SELECT throws_ok(
  $$ UPDATE plantao SET vagas_ocupadas = vagas_totais + 1
       WHERE id = '00000000-0000-0000-0000-0000000000f5' $$,
  '23514',
  NULL,
  'B1: vagas_ocupadas > vagas_totais é rejeitado (chk_vagas)'
);

-- B2: duas marcações confirmadas iguais (mesmo plantão + colaborador) são
-- rejeitadas com 23505 (marcacao_unica_confirmada).
INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada)
  VALUES ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f5',
          '00000000-0000-0000-0000-0000000000f3', 'CONFIRMADA', 'PROPRIA', false);
SELECT throws_ok(
  $$ INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada)
       VALUES ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f5',
               '00000000-0000-0000-0000-0000000000f3', 'CONFIRMADA', 'PROPRIA', false) $$,
  '23505',
  NULL,
  'B2: duas marcações confirmadas iguais são rejeitadas (23505)'
);

-- B3: cancelar e remarcar o mesmo plantão é aceito (índice único é parcial,
-- só cobre status = 'CONFIRMADA').
UPDATE marcacao SET status = 'CANCELADA', cancelado_em = now()
  WHERE id = '00000000-0000-0000-0000-0000000000f6';
SELECT lives_ok(
  $$ INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada)
       VALUES ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000f5',
               '00000000-0000-0000-0000-0000000000f3', 'CONFIRMADA', 'PROPRIA', false) $$,
  'B3: cancelar e remarcar o mesmo plantão é aceito'
);

-- B4: escala diurna e noturna no mesmo dia, mesmo colaborador, é aceita
-- (intervalos contíguos [07,19) e [19,07+1), não sobrepostos).
INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000f3',
          '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2',
          '2026-09-05', '07:00', '19:00');
SELECT lives_ok(
  $$ INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
       VALUES ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000f3',
               '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2',
               '2026-09-05', '19:00', '07:00') $$,
  'B4: escala diurna e noturna contíguas no mesmo dia são aceitas'
);

-- B5: dois registros de escala com intervalos sobrepostos são rejeitados
-- (23P01, excl_escala_sobreposta).
SELECT throws_ok(
  $$ INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
       VALUES ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000f3',
               '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2',
               '2026-09-05', '12:00', '20:00') $$,
  '23P01',
  NULL,
  'B5: escala com intervalo sobreposto é rejeitada (23P01)'
);

-- B6: mes = 13 é rejeitado (chk_mes).
SELECT throws_ok(
  $$ INSERT INTO ciclo (ano, mes, limite_padrao) VALUES (2026, 13, 5) $$,
  '23514',
  NULL,
  'B6: ciclo com mes = 13 é rejeitado (chk_mes)'
);

-- B7: abertura_marcacao > fechamento_marcacao é rejeitado (chk_janela).
SELECT throws_ok(
  $$ UPDATE ciclo SET abertura_marcacao = now(), fechamento_marcacao = now() - interval '1 day'
       WHERE id = '00000000-0000-0000-0000-0000000000f4' $$,
  '23514',
  NULL,
  'B7: abertura_marcacao > fechamento_marcacao é rejeitado (chk_janela)'
);

-- B8: apagar codigo_escala em uso é rejeitado (FK ON DELETE RESTRICT de
-- escala_dia.codigo_escala_id).
SELECT throws_ok(
  $$ DELETE FROM codigo_escala WHERE id = '00000000-0000-0000-0000-0000000000f2' $$,
  '23503',
  NULL,
  'B8: apagar codigo_escala em uso é rejeitado (FK RESTRICT)'
);

SELECT * FROM finish();
ROLLBACK;
