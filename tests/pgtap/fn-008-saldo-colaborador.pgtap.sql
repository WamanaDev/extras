-- ============================================================================
-- PENDENTE DE EXECUÇÃO NESTE AMBIENTE (mesma nota de fn-003/fn-004/fn-005/
-- fn-006/fn-007.pgtap.sql) — confirmado nesta rodada: `docker ps` falha
-- ("failed to connect to the docker API ... daemon is running?"), sem Docker
-- Desktop ativo neste ambiente de agente. Este arquivo NÃO FOI EXECUTADO —
-- escrito e pronto para rodar assim que:
--   1. `docker compose -f docker-compose.dev.yml up -d` subir o Postgres 15
--      local (porta 5432);
--   2. `prisma migrate deploy` tiver aplicado até 20260101000007_funcoes
--      (esta migration, com `saldo_colaborador`);
--   3. A extensão `pgtap` estiver instalada no banco de teste
--      (`CREATE EXTENSION pgtap;`), e rodar via
--      `pg_prove -d <db_teste> tests/pgtap/fn-008-saldo-colaborador.pgtap.sql`.
--
-- Testes pgTAP para specs/03-banco/funcoes/fn-008-saldo-colaborador.md
-- (FN-008), seção "Testes de aceitação": F8-1..F8-6.
--
-- `saldo_colaborador` é STABLE/sem efeito colateral (leitura pura, mesma
-- categoria de fn-003/fn-004/fn-007) — não precisa da arquitetura dblink de
-- fn-005/fn-006 (que existe só por causa da corrida real em `marcar_extra`).
-- Sequencial, uma única transação BEGIN…ROLLBACK.
--
-- Identificadores: UUIDs literais só com dígitos hexadecimais (0-9a-f),
-- prefixo …-0000-000000080XXX (08 = FN-008), mesmo cuidado de
-- fn-004/fn-005/fn-006/fn-007.pgtap.sql.
-- ============================================================================

BEGIN;
SELECT plan(10);

SET LOCAL TIME ZONE 'America/Sao_Paulo';

-- ----------------------------------------------------------------------------
-- Fixtures compartilhados.
-- ----------------------------------------------------------------------------
INSERT INTO rt (id, nome) VALUES ('00000000-0000-0000-0000-000000080001', 'RT FN-008');

-- Ciclo A: limite_padrao=5, permite_cruzada=true — usado por F8-1/F8-3/F8-4/F8-6.
INSERT INTO ciclo (id, ano, mes, status, limite_padrao, permite_cruzada)
  VALUES ('00000000-0000-0000-0000-000000080005', 2026, 9, 'PUBLICADO', 5, true);

-- Ciclo B: outro ciclo, usado só por F8-5 (marcação "de outro ciclo não conta").
INSERT INTO ciclo (id, ano, mes, status, limite_padrao, permite_cruzada)
  VALUES ('00000000-0000-0000-0000-000000080006', 2026, 10, 'PUBLICADO', 5, true);

-- ----------------------------------------------------------------------------
-- F8-1: sem linha `participacao_ciclo` → usa limitePadrao do ciclo, 0 usadas.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000080101', 'MAT9801', 'Colaborador F8-1', 'hash9801', '9801',
          '00000000-0000-0000-0000-000000080001', 'DIURNO', '2026-01-01');

SELECT is(
  (SELECT limite FROM saldo_colaborador(
     '00000000-0000-0000-0000-000000080005', '00000000-0000-0000-0000-000000080101')),
  5,
  'F8-1: sem participacao → limite = limite_padrao do ciclo'
);

SELECT is(
  (SELECT usadas FROM saldo_colaborador(
     '00000000-0000-0000-0000-000000080005', '00000000-0000-0000-0000-000000080101')),
  0,
  'F8-1: sem marcação → usadas = 0'
);

SELECT is(
  (SELECT restantes FROM saldo_colaborador(
     '00000000-0000-0000-0000-000000080005', '00000000-0000-0000-0000-000000080101')),
  5,
  'F8-1: sem marcação → restantes = limite'
);

-- ----------------------------------------------------------------------------
-- F8-2: com override → usa limite_override, não limite_padrao.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000080201', 'MAT9802', 'Colaborador F8-2', 'hash9802', '9802',
          '00000000-0000-0000-0000-000000080001', 'DIURNO', '2026-01-01');

INSERT INTO participacao_ciclo (id, ciclo_id, colaborador_id, limite_override)
  VALUES ('00000000-0000-0000-0000-000000080202', '00000000-0000-0000-0000-000000080005',
          '00000000-0000-0000-0000-000000080201', 3);

SELECT is(
  (SELECT limite FROM saldo_colaborador(
     '00000000-0000-0000-0000-000000080005', '00000000-0000-0000-0000-000000080201')),
  3,
  'F8-2: com limite_override = 3 → limite = 3 (ignora limite_padrao = 5)'
);

-- ----------------------------------------------------------------------------
-- F8-3: limite reduzido abaixo do usado → restantes = 0, sem negativo.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000080301', 'MAT9803', 'Colaborador F8-3', 'hash9803', '9803',
          '00000000-0000-0000-0000-000000080001', 'DIURNO', '2026-01-01');

-- limite_override = 1, mas 3 marcações CONFIRMADAS já existem (admin reduziu
-- a cota depois de marcações já feitas — nota literal da spec).
INSERT INTO participacao_ciclo (id, ciclo_id, colaborador_id, limite_override)
  VALUES ('00000000-0000-0000-0000-000000080302', '00000000-0000-0000-0000-000000080005',
          '00000000-0000-0000-0000-000000080301', 1);

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES
    ('00000000-0000-0000-0000-000000080303', '00000000-0000-0000-0000-000000080005',
     '00000000-0000-0000-0000-000000080001', '2026-09-10', 'DIURNO', '07:00', '19:00', 12, 5),
    ('00000000-0000-0000-0000-000000080304', '00000000-0000-0000-0000-000000080005',
     '00000000-0000-0000-0000-000000080001', '2026-09-11', 'DIURNO', '07:00', '19:00', 12, 5),
    ('00000000-0000-0000-0000-000000080305', '00000000-0000-0000-0000-000000080005',
     '00000000-0000-0000-0000-000000080001', '2026-09-12', 'DIURNO', '07:00', '19:00', 12, 5);

INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada) VALUES
  ('00000000-0000-0000-0000-000000080306', '00000000-0000-0000-0000-000000080303',
   '00000000-0000-0000-0000-000000080301', 'CONFIRMADA', 'COLABORADOR', false),
  ('00000000-0000-0000-0000-000000080307', '00000000-0000-0000-0000-000000080304',
   '00000000-0000-0000-0000-000000080301', 'CONFIRMADA', 'COLABORADOR', false),
  ('00000000-0000-0000-0000-000000080308', '00000000-0000-0000-0000-000000080305',
   '00000000-0000-0000-0000-000000080301', 'CONFIRMADA', 'COLABORADOR', false);

SELECT is(
  (SELECT usadas FROM saldo_colaborador(
     '00000000-0000-0000-0000-000000080005', '00000000-0000-0000-0000-000000080301')),
  3,
  'F8-3: 3 marcações CONFIRMADAS → usadas = 3 (acima do limite_override = 1)'
);

SELECT is(
  (SELECT restantes FROM saldo_colaborador(
     '00000000-0000-0000-0000-000000080005', '00000000-0000-0000-0000-000000080301')),
  0,
  'F8-3: usadas (3) > limite (1) → restantes = 0, nunca negativo'
);

-- ----------------------------------------------------------------------------
-- F8-4: marcações canceladas não contam.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000080401', 'MAT9804', 'Colaborador F8-4', 'hash9804', '9804',
          '00000000-0000-0000-0000-000000080001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000080402', '00000000-0000-0000-0000-000000080005',
          '00000000-0000-0000-0000-000000080001', '2026-09-13', 'DIURNO', '07:00', '19:00', 12, 5);

INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada, cancelado_em)
  VALUES ('00000000-0000-0000-0000-000000080403', '00000000-0000-0000-0000-000000080402',
          '00000000-0000-0000-0000-000000080401', 'CANCELADA', 'COLABORADOR', false, now());

SELECT is(
  (SELECT usadas FROM saldo_colaborador(
     '00000000-0000-0000-0000-000000080005', '00000000-0000-0000-0000-000000080401')),
  0,
  'F8-4: marcação CANCELADA → não conta em usadas'
);

-- ----------------------------------------------------------------------------
-- F8-5: marcação de outro ciclo não conta.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000080501', 'MAT9805', 'Colaborador F8-5', 'hash9805', '9805',
          '00000000-0000-0000-0000-000000080001', 'DIURNO', '2026-01-01');

-- Plantão do ciclo B, não do ciclo A consultado abaixo.
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000080502', '00000000-0000-0000-0000-000000080006',
          '00000000-0000-0000-0000-000000080001', '2026-10-05', 'DIURNO', '07:00', '19:00', 12, 5);

INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada)
  VALUES ('00000000-0000-0000-0000-000000080503', '00000000-0000-0000-0000-000000080502',
          '00000000-0000-0000-0000-000000080501', 'CONFIRMADA', 'COLABORADOR', false);

SELECT is(
  (SELECT usadas FROM saldo_colaborador(
     '00000000-0000-0000-0000-000000080005', '00000000-0000-0000-0000-000000080501')),
  0,
  'F8-5: marcação CONFIRMADA de outro ciclo (B) → não conta no saldo do ciclo A'
);

-- ----------------------------------------------------------------------------
-- F8-6: bloqueado → bloqueado = true + motivo.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000080601', 'MAT9806', 'Colaborador F8-6', 'hash9806', '9806',
          '00000000-0000-0000-0000-000000080001', 'DIURNO', '2026-01-01');

INSERT INTO participacao_ciclo (id, ciclo_id, colaborador_id, bloqueado, motivo)
  VALUES ('00000000-0000-0000-0000-000000080602', '00000000-0000-0000-0000-000000080005',
          '00000000-0000-0000-0000-000000080601', true, 'Suspenso por decisão administrativa');

SELECT is(
  (SELECT bloqueado FROM saldo_colaborador(
     '00000000-0000-0000-0000-000000080005', '00000000-0000-0000-0000-000000080601')),
  true,
  'F8-6: participacao.bloqueado = true → bloqueado = true'
);

SELECT is(
  (SELECT motivo_bloqueio FROM saldo_colaborador(
     '00000000-0000-0000-0000-000000080005', '00000000-0000-0000-0000-000000080601')),
  'Suspenso por decisão administrativa',
  'F8-6: motivo_bloqueio reflete participacao.motivo'
);

SELECT * FROM finish();
ROLLBACK;
