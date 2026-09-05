-- ============================================================================
-- PENDENTE DE EXECUÇÃO NESTE AMBIENTE (mesma nota de rls-policies.pgtap.sql)
-- ============================================================================
-- Testes pgTAP para specs/03-banco/triggers.md (DB-003), seção "Testes de
-- aceitação": G1-G6. Este ambiente de agente não tem Docker daemon acessível
-- (`docker info` falha: "failed to connect to the docker API") nem
-- `pg_prove`/extensão `pgtap` instalados localmente, então este arquivo NÃO
-- FOI EXECUTADO — escrito e pronto para rodar assim que:
--   1. `docker compose -f docker-compose.dev.yml up -d` subir o Postgres 15
--      local (porta 5432);
--   2. `prisma migrate deploy` (ou `dev`) tiver aplicado até
--      20260101000005_triggers;
--   3. A extensão `pgtap` estiver instalada no banco de teste
--      (`CREATE EXTENSION pgtap;`), e rodar via
--      `pg_prove -d <db_teste> tests/pgtap/triggers.pgtap.sql`.
--
-- Cobre G1-G6 na mesma ordem da tabela de triggers.md.
-- ============================================================================

BEGIN;
SELECT plan(6);

SET LOCAL TIME ZONE 'America/Sao_Paulo';

INSERT INTO rt (id, nome) VALUES ('00000000-0000-0000-0000-0000000001f1', 'RT Teste');
INSERT INTO codigo_escala (id, codigo, descricao, presenca, ocupa_horario, remunerada, cor)
  VALUES ('00000000-0000-0000-0000-0000000001f2', 'T', 'Trabalho', true, true, true, '#000000');
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-0000000001f3', 'MAT002', 'Beltrana', 'hash', '5678',
          '00000000-0000-0000-0000-0000000001f1', 'NOTURNO', '2026-01-01');
INSERT INTO ciclo (id, ano, mes, limite_padrao)
  VALUES ('00000000-0000-0000-0000-0000000001f4', 2026, 9, 5);

-- G1: plantão noturno 19:00/07:00 em 04/09 → fim_em = 05/09 07:00-03.
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-0000000001f5', '00000000-0000-0000-0000-0000000001f4',
          '00000000-0000-0000-0000-0000000001f1', '2026-09-04', 'NOTURNO', '19:00', '07:00', 12, 1);
SELECT is(
  (SELECT fim_em FROM plantao WHERE id = '00000000-0000-0000-0000-0000000001f5'),
  '2026-09-05 07:00:00-03'::timestamptz,
  'G1: plantão noturno 19:00/07:00 em 04/09 → fim_em = 05/09 07:00-03'
);

-- G2: plantão diurno 07:00/19:00 → fim_em = mesmo dia 19:00-03.
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-0000000001f6', '00000000-0000-0000-0000-0000000001f4',
          '00000000-0000-0000-0000-0000000001f1', '2026-09-06', 'DIURNO', '07:00', '19:00', 12, 1);
SELECT is(
  (SELECT fim_em FROM plantao WHERE id = '00000000-0000-0000-0000-0000000001f6'),
  '2026-09-06 19:00:00-03'::timestamptz,
  'G2: plantão diurno 07:00/19:00 → fim_em = mesmo dia 19:00-03'
);

-- G3: aplicação envia inicio_em errado — trigger sobrescreve (BEFORE trigger
-- roda depois da atribuição do INSERT, então o valor enviado é substituído).
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais, inicio_em, fim_em)
  VALUES ('00000000-0000-0000-0000-0000000001f7', '00000000-0000-0000-0000-0000000001f4',
          '00000000-0000-0000-0000-0000000001f1', '2026-09-07', 'DIURNO', '07:00', '19:00', 12, 1,
          '1999-01-01 00:00:00-03'::timestamptz, '1999-01-01 00:00:00-03'::timestamptz);
SELECT is(
  (SELECT inicio_em FROM plantao WHERE id = '00000000-0000-0000-0000-0000000001f7'),
  '2026-09-07 07:00:00-03'::timestamptz,
  'G3: inicio_em enviado errado pela aplicação é sobrescrito pelo trigger'
);

-- G4: alterar a data do plantão recalcula o intervalo.
UPDATE plantao SET data = '2026-09-08' WHERE id = '00000000-0000-0000-0000-0000000001f7';
SELECT is(
  (SELECT inicio_em FROM plantao WHERE id = '00000000-0000-0000-0000-0000000001f7'),
  '2026-09-08 07:00:00-03'::timestamptz,
  'G4: alterar data do plantão recalcula o intervalo'
);

-- G5: inserir marcação copia o intervalo do plantão (copiar_intervalo_marcacao).
INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada)
  VALUES ('00000000-0000-0000-0000-0000000001f8', '00000000-0000-0000-0000-0000000001f5',
          '00000000-0000-0000-0000-0000000001f3', 'CONFIRMADA', 'PROPRIA', false);
SELECT is(
  (SELECT (m.inicio_em, m.fim_em) FROM marcacao m WHERE m.id = '00000000-0000-0000-0000-0000000001f8'),
  (SELECT (p.inicio_em, p.fim_em) FROM plantao p WHERE p.id = '00000000-0000-0000-0000-0000000001f5'),
  'G5: intervalo da marcação é copiado do plantão'
);

-- G6: alterar apenas observacao não dispara o trigger de intervalo (a
-- cláusula OF data, hora_inicio, hora_fim restringe o disparo) — inicio_em
-- permanece o valor calculado em G1, não é tocado.
UPDATE plantao SET observacao = 'nota qualquer' WHERE id = '00000000-0000-0000-0000-0000000001f5';
SELECT is(
  (SELECT inicio_em FROM plantao WHERE id = '00000000-0000-0000-0000-0000000001f5'),
  '2026-09-04 19:00:00-03'::timestamptz,
  'G6: alterar apenas observacao não dispara o trigger de intervalo'
);

SELECT * FROM finish();
ROLLBACK;
