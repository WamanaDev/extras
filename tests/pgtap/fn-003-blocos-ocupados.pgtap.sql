-- ============================================================================
-- PENDENTE DE EXECUÇÃO NESTE AMBIENTE (mesma nota de triggers.pgtap.sql)
-- ============================================================================
-- Testes pgTAP para specs/03-banco/funcoes/fn-003-blocos-ocupados.md (FN-003),
-- seção "Testes de aceitação": F3-1..F3-9. Este ambiente de agente não tem
-- Docker daemon acessível (`docker ps` falha: "failed to connect to the
-- docker API ... daemon is running?") nem `pg_prove`/extensão `pgtap`
-- instalados localmente, então este arquivo NÃO FOI EXECUTADO — escrito e
-- pronto para rodar assim que:
--   1. `docker compose -f docker-compose.dev.yml up -d` subir o Postgres 15
--      local (porta 5432);
--   2. `prisma migrate deploy` tiver aplicado até
--      20260101000007_funcoes (esta migration, com `blocos_ocupados`);
--   3. A extensão `pgtap` estiver instalada no banco de teste
--      (`CREATE EXTENSION pgtap;`), e rodar via
--      `pg_prove -d <db_teste> tests/pgtap/fn-003-blocos-ocupados.pgtap.sql`.
--
-- Cobre F3-1..F3-9 na mesma ordem da tabela de fn-003-blocos-ocupados.md.
-- ============================================================================

BEGIN;
SELECT plan(9);

SET LOCAL TIME ZONE 'America/Sao_Paulo';

INSERT INTO rt (id, nome) VALUES ('00000000-0000-0000-0000-0000000003f1', 'RT FN-003');

-- Códigos: D (presenca+ocupaHorario), F (nem uma nem outra), FT e FE
-- (presenca=false, ocupaHorario=true — o ponto sutil da spec).
INSERT INTO codigo_escala (id, codigo, descricao, presenca, ocupa_horario, remunerada, cor) VALUES
  ('00000000-0000-0000-0000-0000000003c1', 'D',  'Disponível',        true,  true,  true,  '#111111'),
  ('00000000-0000-0000-0000-0000000003c2', 'F',  'Folga',             false, false, false, '#222222'),
  ('00000000-0000-0000-0000-0000000003c3', 'FT', 'Folga Treinamento', false, true,  true,  '#333333'),
  ('00000000-0000-0000-0000-0000000003c4', 'FE', 'Folga TRE',         false, true,  true,  '#444444');

INSERT INTO ciclo (id, ano, mes, limite_padrao)
  VALUES ('00000000-0000-0000-0000-0000000003e1', 2026, 9, 5);

INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-0000000003a1', 'MAT9003', 'Fulana FN-003', 'hash9003', '9003',
          '00000000-0000-0000-0000-0000000003f1', 'DIURNO', '2026-01-01');

-- Janela padrão dos testes: o mês de setembro/2026 inteiro.
-- p_de = 2026-09-01 00:00-03, p_ate = 2026-09-30 23:59:59-03 (definidos inline abaixo).

-- ----------------------------------------------------------------------------
-- F3-1: dia com código D → 1 bloco ESCALA.
-- ----------------------------------------------------------------------------
INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-0000000003a1',
          '00000000-0000-0000-0000-0000000003e1', '00000000-0000-0000-0000-0000000003c1',
          '2026-09-01', '07:00', '19:00');

SELECT is(
  (SELECT count(*) FROM blocos_ocupados(
     '00000000-0000-0000-0000-0000000003a1',
     '2026-09-01 00:00:00-03'::timestamptz, '2026-09-02 00:00:00-03'::timestamptz)
   WHERE origem = 'ESCALA'),
  1::bigint,
  'F3-1: dia com código D → 1 bloco ESCALA'
);

-- ----------------------------------------------------------------------------
-- F3-2: dia com F → 0 blocos.
-- ----------------------------------------------------------------------------
INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-0000000003d2', '00000000-0000-0000-0000-0000000003a1',
          '00000000-0000-0000-0000-0000000003e1', '00000000-0000-0000-0000-0000000003c2',
          '2026-09-02', NULL, NULL);

SELECT is(
  (SELECT count(*) FROM blocos_ocupados(
     '00000000-0000-0000-0000-0000000003a1',
     '2026-09-02 00:00:00-03'::timestamptz, '2026-09-03 00:00:00-03'::timestamptz)),
  0::bigint,
  'F3-2: dia com F → 0 blocos'
);

-- ----------------------------------------------------------------------------
-- F3-3: dia com FT → 1 bloco ESCALA (ocupa_horario=true apesar de presenca=false).
-- ----------------------------------------------------------------------------
INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-0000000003d3', '00000000-0000-0000-0000-0000000003a1',
          '00000000-0000-0000-0000-0000000003e1', '00000000-0000-0000-0000-0000000003c3',
          '2026-09-03', '07:00', '19:00');

SELECT is(
  (SELECT count(*) FROM blocos_ocupados(
     '00000000-0000-0000-0000-0000000003a1',
     '2026-09-03 00:00:00-03'::timestamptz, '2026-09-04 00:00:00-03'::timestamptz)
   WHERE origem = 'ESCALA'),
  1::bigint,
  'F3-3: dia com FT → 1 bloco ESCALA (não é o bug de trocar OR por AND)'
);

-- ----------------------------------------------------------------------------
-- F3-4: dia com FE → 1 bloco ESCALA (mesmo motivo de F3-3).
-- ----------------------------------------------------------------------------
INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-0000000003d4', '00000000-0000-0000-0000-0000000003a1',
          '00000000-0000-0000-0000-0000000003e1', '00000000-0000-0000-0000-0000000003c4',
          '2026-09-04', '07:00', '19:00');

SELECT is(
  (SELECT count(*) FROM blocos_ocupados(
     '00000000-0000-0000-0000-0000000003a1',
     '2026-09-04 00:00:00-03'::timestamptz, '2026-09-05 00:00:00-03'::timestamptz)
   WHERE origem = 'ESCALA'),
  1::bigint,
  'F3-4: dia com FE → 1 bloco ESCALA'
);

-- ----------------------------------------------------------------------------
-- F3-5 / F3-6: extra confirmada → 1 bloco EXTRA; extra cancelada → 0 blocos.
-- ----------------------------------------------------------------------------
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-0000000003p1', '00000000-0000-0000-0000-0000000003e1',
          '00000000-0000-0000-0000-0000000003f1', '2026-09-10', 'DIURNO', '07:00', '19:00', 12, 1),
         ('00000000-0000-0000-0000-0000000003p2', '00000000-0000-0000-0000-0000000003e1',
          '00000000-0000-0000-0000-0000000003f1', '2026-09-11', 'DIURNO', '07:00', '19:00', 12, 1);

INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada)
  VALUES ('00000000-0000-0000-0000-0000000003m1', '00000000-0000-0000-0000-0000000003p1',
          '00000000-0000-0000-0000-0000000003a1', 'CONFIRMADA', 'PROPRIA', false);

SELECT is(
  (SELECT count(*) FROM blocos_ocupados(
     '00000000-0000-0000-0000-0000000003a1',
     '2026-09-10 00:00:00-03'::timestamptz, '2026-09-11 00:00:00-03'::timestamptz)
   WHERE origem = 'EXTRA'),
  1::bigint,
  'F3-5: extra confirmada → 1 bloco EXTRA'
);

INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada)
  VALUES ('00000000-0000-0000-0000-0000000003m2', '00000000-0000-0000-0000-0000000003p2',
          '00000000-0000-0000-0000-0000000003a1', 'CANCELADA', 'PROPRIA', false);

SELECT is(
  (SELECT count(*) FROM blocos_ocupados(
     '00000000-0000-0000-0000-0000000003a1',
     '2026-09-11 00:00:00-03'::timestamptz, '2026-09-12 00:00:00-03'::timestamptz)
   WHERE origem = 'EXTRA'),
  0::bigint,
  'F3-6: extra cancelada → 0 blocos'
);

-- ----------------------------------------------------------------------------
-- F3-7 / F3-8: bloco fora da janela não retorna; bloco parcialmente na
-- janela retorna (o F3-1 acima, 2026-09-01 07:00-19:00, é usado como bloco de
-- referência: janela que termina antes dele não retorna, janela que corta o
-- meio dele retorna).
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*) FROM blocos_ocupados(
     '00000000-0000-0000-0000-0000000003a1',
     '2026-08-01 00:00:00-03'::timestamptz, '2026-08-31 00:00:00-03'::timestamptz)),
  0::bigint,
  'F3-7: bloco fora da janela não retorna'
);

SELECT is(
  (SELECT count(*) FROM blocos_ocupados(
     '00000000-0000-0000-0000-0000000003a1',
     '2026-09-01 12:00:00-03'::timestamptz, '2026-09-01 15:00:00-03'::timestamptz)
   WHERE origem = 'ESCALA' AND referencia_id = '00000000-0000-0000-0000-0000000003d1'),
  1::bigint,
  'F3-8: bloco parcialmente na janela retorna'
);

-- ----------------------------------------------------------------------------
-- F3-9: ordenação crescente por inicio_em (a janela do mês inteiro cobre os
-- blocos D/FT/FE inseridos em F3-1/F3-3/F3-4 mais a extra de F3-5).
-- ----------------------------------------------------------------------------
SELECT ok(
  (SELECT array_agg(inicio_em) FROM blocos_ocupados(
     '00000000-0000-0000-0000-0000000003a1',
     '2026-09-01 00:00:00-03'::timestamptz, '2026-09-30 23:59:59-03'::timestamptz))
  =
  (SELECT array_agg(inicio_em ORDER BY inicio_em) FROM blocos_ocupados(
     '00000000-0000-0000-0000-0000000003a1',
     '2026-09-01 00:00:00-03'::timestamptz, '2026-09-30 23:59:59-03'::timestamptz)),
  'F3-9: resultado ordenado crescente por inicio_em (já vem ORDER BY 1 da função)'
);

SELECT * FROM finish();
ROLLBACK;
