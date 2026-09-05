-- ============================================================================
-- PENDENTE DE EXECUÇÃO NESTE AMBIENTE (mesma nota de fn-003..fn-008.pgtap.sql
-- desta pasta) — confirmado nesta rodada: `docker ps` falha ("failed to
-- connect to the docker API ... daemon is running?"), sem Docker Desktop
-- ativo neste ambiente de agente. Este arquivo NÃO FOI EXECUTADO — escrito e
-- pronto para rodar assim que:
--   1. `docker compose -f docker-compose.dev.yml up -d` subir o Postgres 15
--      local (porta 5432);
--   2. `prisma migrate deploy` tiver aplicado até 20260101000007_funcoes
--      (esta migration, com `cobertura_ciclo` e o `ALTER TABLE rt ADD COLUMN
--      cobertura_minima_diurno/_noturno` que a precede — ver comentário da
--      função na migration e _conflitos.md item 10);
--   3. A extensão `pgtap` estiver instalada no banco de teste
--      (`CREATE EXTENSION pgtap;`), e rodar via
--      `pg_prove -d <db_teste> tests/pgtap/fn-009-cobertura-ciclo.pgtap.sql`.
--
-- Testes pgTAP para specs/03-banco/funcoes/fn-009-cobertura-ciclo.md
-- (FN-009), seção "Testes de aceitação": F9-1..F9-5.
--
-- `cobertura_ciclo` é STABLE/sem efeito colateral (leitura pura, mesma
-- categoria de fn-003/fn-004/fn-007/fn-008) — sequencial, uma única
-- transação BEGIN…ROLLBACK, mesmo padrão de fn-008-saldo-colaborador.pgtap.sql.
--
-- Uma única RT (`cobertura_minima_diurno = 2`) e um único ciclo (2026-09)
-- são compartilhados por todos os cenários; cada cenário usa uma DATA
-- diferente do mês para não colidir com os outros (a função retorna uma
-- linha por dia×RT×turno do mês inteiro — o teste sempre filtra por
-- `data`/`turno` explícitos, nunca assume ordem ou conta linhas totais).
--
-- Identificadores: UUIDs literais só com dígitos hexadecimais (0-9a-f),
-- prefixo …-0000-000000090XXX (09 = FN-009), mesmo cuidado de
-- fn-004..fn-008.pgtap.sql.
-- ============================================================================

BEGIN;
SELECT plan(10);

SET LOCAL TIME ZONE 'America/Sao_Paulo';

-- ----------------------------------------------------------------------------
-- Fixtures compartilhados.
-- ----------------------------------------------------------------------------
INSERT INTO rt (id, nome, cobertura_minima_diurno, cobertura_minima_noturno)
  VALUES ('00000000-0000-0000-0000-000000090001', 'RT FN-009', 2, 0);

INSERT INTO ciclo (id, ano, mes, status, limite_padrao)
  VALUES ('00000000-0000-0000-0000-000000090005', 2026, 9, 'PUBLICADO', 5);

INSERT INTO codigo_escala (id, codigo, descricao, presenca, ocupa_horario, remunerada, cor) VALUES
  ('00000000-0000-0000-0000-000000090011', 'D',  'Disponível', true,  true,  true,  '#111111'),
  ('00000000-0000-0000-0000-000000090012', 'F',  'Folga',      false, false, false, '#222222'),
  ('00000000-0000-0000-0000-000000090013', 'FT', 'Férias',     false, true,  true,  '#333333');

-- ----------------------------------------------------------------------------
-- F9-1: dia completo (2 escalados presentes, minimo = 2) → deficit = 0.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora) VALUES
  ('00000000-0000-0000-0000-000000090101', 'MAT9901', 'Colaborador F9-1a', 'hash9901', '9901',
   '00000000-0000-0000-0000-000000090001', 'DIURNO', '2026-01-01'),
  ('00000000-0000-0000-0000-000000090102', 'MAT9902', 'Colaborador F9-1b', 'hash9902', '9902',
   '00000000-0000-0000-0000-000000090001', 'DIURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim) VALUES
  ('00000000-0000-0000-0000-000000090103', '00000000-0000-0000-0000-000000090101',
   '00000000-0000-0000-0000-000000090005', '00000000-0000-0000-0000-000000090011',
   '2026-09-10', '07:00', '19:00'),
  ('00000000-0000-0000-0000-000000090104', '00000000-0000-0000-0000-000000090102',
   '00000000-0000-0000-0000-000000090005', '00000000-0000-0000-0000-000000090011',
   '2026-09-10', '07:00', '19:00');

SELECT is(
  (SELECT total FROM cobertura_ciclo('00000000-0000-0000-0000-000000090005')
   WHERE data = '2026-09-10' AND rt_codigo = 'RT FN-009' AND turno = 'DIURNO'),
  2,
  'F9-1: 2 escalados presentes, sem extra → total = 2'
);

SELECT is(
  (SELECT deficit FROM cobertura_ciclo('00000000-0000-0000-0000-000000090005')
   WHERE data = '2026-09-10' AND rt_codigo = 'RT FN-009' AND turno = 'DIURNO'),
  0,
  'F9-1: total (2) = minimo (2) → deficit = 0'
);

-- ----------------------------------------------------------------------------
-- F9-2: um dos dois lança F (folga) → só 1 escalado, abaixo do minimo (2) →
-- deficit > 0.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora) VALUES
  ('00000000-0000-0000-0000-000000090201', 'MAT9903', 'Colaborador F9-2a', 'hash9903', '9903',
   '00000000-0000-0000-0000-000000090001', 'DIURNO', '2026-01-01'),
  ('00000000-0000-0000-0000-000000090202', 'MAT9904', 'Colaborador F9-2b', 'hash9904', '9904',
   '00000000-0000-0000-0000-000000090001', 'DIURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim) VALUES
  -- presente
  ('00000000-0000-0000-0000-000000090203', '00000000-0000-0000-0000-000000090201',
   '00000000-0000-0000-0000-000000090005', '00000000-0000-0000-0000-000000090011',
   '2026-09-11', '07:00', '19:00'),
  -- folga (F): presenca = false, derruba a cobertura do dia
  ('00000000-0000-0000-0000-000000090204', '00000000-0000-0000-0000-000000090202',
   '00000000-0000-0000-0000-000000090005', '00000000-0000-0000-0000-000000090012',
   '2026-09-11', NULL, NULL);

SELECT is(
  (SELECT escalados FROM cobertura_ciclo('00000000-0000-0000-0000-000000090005')
   WHERE data = '2026-09-11' AND rt_codigo = 'RT FN-009' AND turno = 'DIURNO'),
  1,
  'F9-2: um F lançado → escalados = 1 (o outro código F não conta)'
);

SELECT ok(
  (SELECT deficit FROM cobertura_ciclo('00000000-0000-0000-0000-000000090005')
   WHERE data = '2026-09-11' AND rt_codigo = 'RT FN-009' AND turno = 'DIURNO') > 0,
  'F9-2: 1 escalado < minimo (2) → deficit > 0'
);

-- ----------------------------------------------------------------------------
-- F9-3: extra confirmada no mesmo dia/RT/turno de F9-2 cobre o buraco →
-- deficit volta a 0.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000090301', 'MAT9905', 'Colaborador F9-3', 'hash9905', '9905',
          '00000000-0000-0000-0000-000000090001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000090302', '00000000-0000-0000-0000-000000090005',
          '00000000-0000-0000-0000-000000090001', '2026-09-11', 'DIURNO', '07:00', '19:00', 12, 5);

INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada)
  VALUES ('00000000-0000-0000-0000-000000090303', '00000000-0000-0000-0000-000000090302',
          '00000000-0000-0000-0000-000000090301', 'CONFIRMADA', 'COLABORADOR', false);

SELECT is(
  (SELECT total FROM cobertura_ciclo('00000000-0000-0000-0000-000000090005')
   WHERE data = '2026-09-11' AND rt_codigo = 'RT FN-009' AND turno = 'DIURNO'),
  2,
  'F9-3: 1 escalado + 1 extra confirmada → total = 2 (buraco de F9-2 coberto)'
);

SELECT is(
  (SELECT deficit FROM cobertura_ciclo('00000000-0000-0000-0000-000000090005')
   WHERE data = '2026-09-11' AND rt_codigo = 'RT FN-009' AND turno = 'DIURNO'),
  0,
  'F9-3: total (2) = minimo (2) após extra → deficit volta a 0'
);

-- ----------------------------------------------------------------------------
-- F9-4: FT no dia (presenca = false) → não conta como escalado.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000090401', 'MAT9906', 'Colaborador F9-4', 'hash9906', '9906',
          '00000000-0000-0000-0000-000000090001', 'DIURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-000000090402', '00000000-0000-0000-0000-000000090401',
          '00000000-0000-0000-0000-000000090005', '00000000-0000-0000-0000-000000090013',
          '2026-09-12', NULL, NULL);

SELECT is(
  (SELECT escalados FROM cobertura_ciclo('00000000-0000-0000-0000-000000090005')
   WHERE data = '2026-09-12' AND rt_codigo = 'RT FN-009' AND turno = 'DIURNO'),
  0,
  'F9-4: único lançamento do dia é FT (presenca = false) → escalados = 0'
);

SELECT is(
  (SELECT deficit FROM cobertura_ciclo('00000000-0000-0000-0000-000000090005')
   WHERE data = '2026-09-12' AND rt_codigo = 'RT FN-009' AND turno = 'DIURNO'),
  2,
  'F9-4: FT não cobre → deficit = minimo inteiro (2)'
);

-- ----------------------------------------------------------------------------
-- F9-5: extra cancelada não conta.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora) VALUES
  ('00000000-0000-0000-0000-000000090501', 'MAT9907', 'Colaborador F9-5a', 'hash9907', '9907',
   '00000000-0000-0000-0000-000000090001', 'DIURNO', '2026-01-01'),
  ('00000000-0000-0000-0000-000000090502', 'MAT9908', 'Colaborador F9-5b', 'hash9908', '9908',
   '00000000-0000-0000-0000-000000090001', 'DIURNO', '2026-01-01');

-- 1 escalado presente.
INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-000000090503', '00000000-0000-0000-0000-000000090501',
          '00000000-0000-0000-0000-000000090005', '00000000-0000-0000-0000-000000090011',
          '2026-09-13', '07:00', '19:00');

-- Extra do mesmo dia/RT/turno, mas CANCELADA — não deve entrar em `extras`.
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000090504', '00000000-0000-0000-0000-000000090005',
          '00000000-0000-0000-0000-000000090001', '2026-09-13', 'DIURNO', '07:00', '19:00', 12, 5);

INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada, cancelado_em)
  VALUES ('00000000-0000-0000-0000-000000090505', '00000000-0000-0000-0000-000000090504',
          '00000000-0000-0000-0000-000000090502', 'CANCELADA', 'COLABORADOR', false, now());

SELECT is(
  (SELECT extras FROM cobertura_ciclo('00000000-0000-0000-0000-000000090005')
   WHERE data = '2026-09-13' AND rt_codigo = 'RT FN-009' AND turno = 'DIURNO'),
  0,
  'F9-5: marcação CANCELADA → não conta em extras'
);

SELECT is(
  (SELECT total FROM cobertura_ciclo('00000000-0000-0000-0000-000000090005')
   WHERE data = '2026-09-13' AND rt_codigo = 'RT FN-009' AND turno = 'DIURNO'),
  1,
  'F9-5: total = só o escalado presente (1), extra cancelada não soma'
);

SELECT * FROM finish();
ROLLBACK;
