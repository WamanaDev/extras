-- ============================================================================
-- PENDENTE DE EXECUÇÃO NESTE AMBIENTE (mesma nota de fn-003/fn-004/fn-005/
-- fn-006.pgtap.sql) — confirmado nesta rodada: `docker ps` falha ("failed to
-- connect to the docker API ... daemon is running?"), sem Docker Desktop
-- ativo neste ambiente de agente. Este arquivo NÃO FOI EXECUTADO — escrito e
-- pronto para rodar assim que:
--   1. `docker compose -f docker-compose.dev.yml up -d` subir o Postgres 15
--      local (porta 5432);
--   2. `prisma migrate deploy` tiver aplicado até 20260101000007_funcoes
--      (esta migration, com `plantoes_para_colaborador`, `valida_descanso`,
--      `marcar_extra` e `blocos_ocupados` — a função sob teste chama
--      `valida_descanso` internamente, mesma dependência de FN-005);
--   3. A extensão `pgtap` estiver instalada no banco de teste
--      (`CREATE EXTENSION pgtap;`), e rodar via
--      `pg_prove -d <db_teste> tests/pgtap/fn-007-plantoes-para-colaborador.pgtap.sql`.
--
-- Testes pgTAP para specs/03-banco/funcoes/fn-007-plantoes-para-colaborador.md
-- (FN-007), seção "Testes de aceitação": F7-1..F7-9.
--
-- F7-1..F7-7 e um recorte de F7-8 são cobertos abaixo, sequencial, uma única
-- transação BEGIN…ROLLBACK (mesmo padrão de fn-004-valida-descanso.pgtap.sql
-- — função sob teste é STABLE/sem efeito colateral, não precisa da
-- arquitetura dblink de fn-005/fn-006, que existe só por causa da corrida
-- real em `marcar_extra`).
--
-- F7-8 completo ("idênticos em 100 cenários") é comparação estatística em
-- massa entre `plantoes_para_colaborador` e o erro lançado por `marcar_extra`
-- — mesmo tipo de escopo de TST-003 (specs/07-testes/paridade-escala.md),
-- fora deste arquivo. Aqui, em vez disso, dois dos cenários já fixados acima
-- (F7-4/CRUZADA_BLOQUEADA e F7-6/EXCEDE_JORNADA) são reaproveitados para
-- confirmar que `marcar_extra`, chamado sobre o mesmo par
-- (plantão, colaborador), lança exatamente o mesmo código que
-- `plantoes_para_colaborador` reportou como `motivo` — não uma amostra de
-- 100, mas a mesma garantia estrutural: os dois pontos de decisão convergem
-- porque `plantoes_para_colaborador` chama a mesma `valida_descanso` (FN-004)
-- que `marcar_extra` usa no passo 8, em vez de reimplementar a regra.
--
-- F7-9 (ciclo com 50 plantões, p95 < 100ms) é teste de desempenho — não
-- verificável de forma significativa por `pg_prove`/pgTAP num ambiente de CI
-- sem hardware/dados representativos (mesmo raciocínio já registrado para
-- F5-14 e a suíte de carga TST-002/C10). Marcado com `skip()` abaixo;
-- medição real fica para execução manual/observabilidade de produção
-- (`SEC-DISP`, cache de 5s no edge já é a mitigação prevista na spec, não
-- este teste).
--
-- Identificadores: UUIDs literais só com dígitos hexadecimais (0-9a-f),
-- prefixo …-0000-000000070XXX (07 = FN-007), mesmo cuidado de
-- fn-004/fn-005/fn-006.pgtap.sql.
-- ============================================================================

BEGIN;
SELECT plan(19);

SET LOCAL TIME ZONE 'America/Sao_Paulo';

-- ----------------------------------------------------------------------------
-- Fixtures compartilhados.
-- ----------------------------------------------------------------------------
INSERT INTO rt (id, nome) VALUES
  ('00000000-0000-0000-0000-000000070001', 'RT1 FN-007'),
  ('00000000-0000-0000-0000-000000070002', 'RT2 FN-007');

INSERT INTO codigo_escala (id, codigo, descricao, presenca, ocupa_horario, remunerada, cor) VALUES
  ('00000000-0000-0000-0000-000000070003', 'D', 'Disponível', true,  true,  true,  '#111111'),
  ('00000000-0000-0000-0000-000000070004', 'F', 'Folga',      false, false, false, '#222222');

-- Ciclo A: publicado, janela aberta, cruzada desligada em todos os níveis,
-- extra-em-folga desligado, limite_padrao=5, max_blocos_seguidos=2 — mesmo
-- desenho de fixtures de fn-005-marcar-extra.pgtap.sql, reaproveitado aqui
-- porque plantoes_para_colaborador precisa avaliar exatamente as mesmas
-- regras.
INSERT INTO ciclo (
  id, ano, mes, status, limite_padrao, permite_cruzada, permite_extra_em_folga,
  max_blocos_seguidos, abertura_marcacao, fechamento_marcacao
) VALUES (
  '00000000-0000-0000-0000-000000070005', 2026, 9, 'PUBLICADO', 5, false, false,
  2, now() - interval '1 day', now() + interval '30 days'
);

-- ----------------------------------------------------------------------------
-- F7-1: colaborador sem restrição, plantão da própria RT, sem marcação, sem
-- escala de ausência, sem conflito de horário, longe do limite → disponível.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000070101', 'MAT9701', 'Colaborador F7-1', 'hash9701', '9701',
          '00000000-0000-0000-0000-000000070001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000070102', '00000000-0000-0000-0000-000000070005',
          '00000000-0000-0000-0000-000000070001', '2026-09-10', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT is(
  (SELECT disponivel FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070101')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070102'),
  true,
  'F7-1: colaborador sem restrição → disponivel = true'
);

SELECT is(
  (SELECT motivo FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070101')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070102'),
  NULL,
  'F7-1: colaborador sem restrição → motivo NULL'
);

SELECT is(
  (SELECT ja_marcado FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070101')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070102'),
  false,
  'F7-1: colaborador sem restrição → ja_marcado = false'
);

-- ----------------------------------------------------------------------------
-- F7-2: colaborador no limite (limite_padrao=1 do ciclo B, 1 marcação já
-- confirmada) → um SEGUNDO plantão do mesmo ciclo, ainda não marcado, deve
-- vir com motivo LIMITE_ATINGIDO (calculado uma vez, fora do laço).
-- ----------------------------------------------------------------------------
INSERT INTO ciclo (
  id, ano, mes, status, limite_padrao, permite_cruzada, permite_extra_em_folga,
  max_blocos_seguidos, abertura_marcacao, fechamento_marcacao
) VALUES (
  '00000000-0000-0000-0000-000000070201', 2026, 10, 'PUBLICADO', 1, false, false,
  2, now() - interval '1 day', now() + interval '30 days'
);

INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000070202', 'MAT9702', 'Colaborador F7-2', 'hash9702', '9702',
          '00000000-0000-0000-0000-000000070001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES
    ('00000000-0000-0000-0000-000000070203', '00000000-0000-0000-0000-000000070201',
     '00000000-0000-0000-0000-000000070001', '2026-10-05', 'DIURNO', '07:00', '19:00', 12, 5),
    ('00000000-0000-0000-0000-000000070204', '00000000-0000-0000-0000-000000070201',
     '00000000-0000-0000-0000-000000070001', '2026-10-20', 'DIURNO', '07:00', '19:00', 12, 5);

-- Consome o único slot do limite no primeiro plantão.
INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada)
  VALUES ('00000000-0000-0000-0000-000000070205', '00000000-0000-0000-0000-000000070203',
          '00000000-0000-0000-0000-000000070202', 'CONFIRMADA', 'COLABORADOR', false);

SELECT is(
  (SELECT motivo FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070201', '00000000-0000-0000-0000-000000070202')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070204'),
  'LIMITE_ATINGIDO',
  'F7-2: no limite (limite_padrao=1, 1 usada) → segundo plantão = LIMITE_ATINGIDO'
);

SELECT is(
  (SELECT disponivel FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070201', '00000000-0000-0000-0000-000000070202')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070204'),
  false,
  'F7-2: no limite → disponivel = false'
);

-- ----------------------------------------------------------------------------
-- F7-3: plantão lotado (vagas_ocupadas = vagas_totais), colaborador que não
-- marcou este plantão → SEM_VAGA (último da ordem, "estaria liberado, mas
-- lotou").
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000070301', 'MAT9703', 'Colaborador F7-3', 'hash9703', '9703',
          '00000000-0000-0000-0000-000000070001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas,
                      vagas_totais, vagas_ocupadas)
  VALUES ('00000000-0000-0000-0000-000000070302', '00000000-0000-0000-0000-000000070005',
          '00000000-0000-0000-0000-000000070001', '2026-09-11', 'DIURNO', '07:00', '19:00', 12, 1, 1);

SELECT is(
  (SELECT motivo FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070301')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070302'),
  'SEM_VAGA',
  'F7-3: plantão lotado, colaborador não é quem marcou → SEM_VAGA'
);

-- ----------------------------------------------------------------------------
-- F7-4: colaborador de outra RT, cruzada desligada em todos os níveis (ciclo
-- A) → CRUZADA_BLOQUEADA.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000070401', 'MAT9704', 'Colaborador F7-4', 'hash9704', '9704',
          '00000000-0000-0000-0000-000000070002', 'DIURNO', '2026-01-01');

-- Plantão da RT1; colaborador é da RT2.
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000070402', '00000000-0000-0000-0000-000000070005',
          '00000000-0000-0000-0000-000000070001', '2026-09-12', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT is(
  (SELECT motivo FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070401')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070402'),
  'CRUZADA_BLOQUEADA',
  'F7-4: outra RT, cruzada off em todos os níveis → CRUZADA_BLOQUEADA'
);

-- ----------------------------------------------------------------------------
-- F7-5: escala base (D) no mesmo dia e mesmo turno do plantão-extra →
-- CONFLITO_DE_HORARIO (via valida_descanso, mesma regra de F5-9).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000070501', 'MAT9705', 'Colaborador F7-5', 'hash9705', '9705',
          '00000000-0000-0000-0000-000000070001', 'DIURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-000000070502', '00000000-0000-0000-0000-000000070501',
          '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070003',
          '2026-09-13', '07:00', '19:00');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000070503', '00000000-0000-0000-0000-000000070005',
          '00000000-0000-0000-0000-000000070001', '2026-09-13', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT is(
  (SELECT motivo FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070501')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070503'),
  'CONFLITO_DE_HORARIO',
  'F7-5: extra sobre o mesmo turno da escala base → CONFLITO_DE_HORARIO'
);

-- ----------------------------------------------------------------------------
-- F7-6: dois blocos já contíguos (escala base), terceiro plantão-extra
-- contíguo formaria 36h (max_blocos_seguidos=2 do ciclo A) → EXCEDE_JORNADA.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000070601', 'MAT9706', 'Colaborador F7-6', 'hash9706', '9706',
          '00000000-0000-0000-0000-000000070001', 'NOTURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES
    ('00000000-0000-0000-0000-000000070602', '00000000-0000-0000-0000-000000070601',
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070003',
     '2026-09-14', '07:00', '19:00'),
    ('00000000-0000-0000-0000-000000070603', '00000000-0000-0000-0000-000000070601',
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070003',
     '2026-09-14', '19:00', '07:00');

-- 3º bloco contíguo (09-15 07:00-19:00) fecha 36h.
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000070604', '00000000-0000-0000-0000-000000070005',
          '00000000-0000-0000-0000-000000070001', '2026-09-15', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT is(
  (SELECT motivo FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070601')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070604'),
  'EXCEDE_JORNADA',
  'F7-6: 3º bloco contíguo (36h, max_blocos=2) → EXCEDE_JORNADA'
);

-- ----------------------------------------------------------------------------
-- F7-7: colaborador já marcou o plantão → ja_marcado = true, disponivel =
-- false, motivo NULL (JA_MARCADO vence todos os outros motivos).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000070701', 'MAT9707', 'Colaborador F7-7', 'hash9707', '9707',
          '00000000-0000-0000-0000-000000070001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000070702', '00000000-0000-0000-0000-000000070005',
          '00000000-0000-0000-0000-000000070001', '2026-09-16', 'DIURNO', '07:00', '19:00', 12, 5);

INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada)
  VALUES ('00000000-0000-0000-0000-000000070703', '00000000-0000-0000-0000-000000070702',
          '00000000-0000-0000-0000-000000070701', 'CONFIRMADA', 'COLABORADOR', false);

SELECT is(
  (SELECT ja_marcado FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070701')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070702'),
  true,
  'F7-7: colaborador já marcou → ja_marcado = true'
);

SELECT is(
  (SELECT disponivel FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070701')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070702'),
  false,
  'F7-7: colaborador já marcou → disponivel = false'
);

SELECT is(
  (SELECT motivo FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070701')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070702'),
  NULL,
  'F7-7: colaborador já marcou → motivo NULL (JA_MARCADO não é "erro")'
);

-- ----------------------------------------------------------------------------
-- F7-8 (recorte): o motivo relatado por plantoes_para_colaborador precisa
-- ser o MESMO código que marcar_extra lançaria para o mesmo par
-- (plantão, colaborador). Reaproveita os fixtures de F7-4 (CRUZADA_BLOQUEADA)
-- e F7-6 (EXCEDE_JORNADA) — ver nota no cabeçalho sobre por que isto não
-- substitui a comparação de 100 cenários de TST-003.
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT motivo FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070401')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070402'),
  'CRUZADA_BLOQUEADA',
  'F7-8a (setup): plantoes_para_colaborador relata CRUZADA_BLOQUEADA para F7-4'
);

SELECT throws_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000070402'::uuid,
                          '00000000-0000-0000-0000-000000070401'::uuid) $$,
  'CRUZADA_BLOQUEADA',
  'F7-8a: marcar_extra lança o MESMO código (CRUZADA_BLOQUEADA) para o mesmo par'
);

SELECT is(
  (SELECT motivo FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070601')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070604'),
  'EXCEDE_JORNADA',
  'F7-8b (setup): plantoes_para_colaborador relata EXCEDE_JORNADA para F7-6'
);

SELECT throws_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000070604'::uuid,
                          '00000000-0000-0000-0000-000000070601'::uuid) $$,
  'EXCEDE_JORNADA',
  'F7-8b: marcar_extra lança o MESMO código (EXCEDE_JORNADA) para o mesmo par'
);

-- ----------------------------------------------------------------------------
-- F7-8c: RN-16 estendida (pedido do usuário, ver 20260906130000_fn005_fn007_
-- ausencia_turno_seguinte). Colaborador NOTURNO com folga (F) em 2026-09-20;
-- plantão-extra NOTURNO em 2026-09-19 "termina" na madrugada do dia de folga
-- → plantoes_para_colaborador precisa relatar EM_AUSENCIA, e marcar_extra
-- precisa lançar o mesmo código para o mesmo par (mesma garantia de
-- convergência de F7-8a/b, agora para o motivo novo).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000070a01', 'MAT9708', 'Colaborador F7-8c', 'hash9708', '9708',
          '00000000-0000-0000-0000-000000070001', 'NOTURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-000000070a02', '00000000-0000-0000-0000-000000070a01',
          '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070004',
          '2026-09-20', '19:00', '07:00');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000070a03', '00000000-0000-0000-0000-000000070005',
          '00000000-0000-0000-0000-000000070001', '2026-09-19', 'NOTURNO', '19:00', '07:00', 12, 5);

SELECT is(
  (SELECT motivo FROM plantoes_para_colaborador(
     '00000000-0000-0000-0000-000000070005', '00000000-0000-0000-0000-000000070a01')
   WHERE plantao_id = '00000000-0000-0000-0000-000000070a03'),
  'EM_AUSENCIA',
  'F7-8c (setup): plantoes_para_colaborador relata EM_AUSENCIA para extra NOTURNA na véspera de um F'
);

SELECT throws_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000070a03'::uuid,
                          '00000000-0000-0000-0000-000000070a01'::uuid) $$,
  'EM_AUSENCIA',
  'F7-8c: marcar_extra lança o MESMO código (EM_AUSENCIA) para o mesmo par'
);

-- ----------------------------------------------------------------------------
-- F7-9: desempenho (ciclo com 50 plantões, p95 < 100ms) — fora do escopo de
-- pgTAP/CI, ver nota no cabeçalho. Marcado como skip() em vez de fingir uma
-- medição sem significado estatístico numa única execução isolada.
-- ----------------------------------------------------------------------------
SELECT skip(1, 'F7-9: benchmark de latência (p95 < 100ms) — TST-002/observabilidade, não pgTAP/CI');

SELECT * FROM finish();
ROLLBACK;
