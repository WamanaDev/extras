-- ============================================================================
-- PENDENTE DE EXECUÇÃO NESTE AMBIENTE (mesma nota de fn-003/fn-004.pgtap.sql)
-- ============================================================================
-- Testes pgTAP para specs/03-banco/funcoes/fn-005-marcar-extra.md (FN-005),
-- seção "Testes de aceitação": F5-1, F5-5..F5-16. Este ambiente de agente não tem
-- Docker daemon acessível nem `pg_prove`/extensão `pgtap` instalados
-- localmente, então este arquivo NÃO FOI EXECUTADO — escrito e pronto para
-- rodar assim que:
--   1. `docker compose -f docker-compose.dev.yml up -d` subir o Postgres 15
--      local (porta 5432);
--   2. `prisma migrate deploy` tiver aplicado até 20260101000007_funcoes
--      (esta migration, com `marcar_extra`, `valida_descanso` e
--      `blocos_ocupados`) e as migrations posteriores necessárias
--      (constraints/triggers/índices já existem antes desta na ordem MG);
--   3. As extensões `pgtap` e `dblink` estiverem instaladas no banco de
--      teste (`CREATE EXTENSION pgtap; CREATE EXTENSION dblink;`), e rodar
--      via `pg_prove -d <db_teste> tests/pgtap/fn-005-marcar-extra.pgtap.sql`.
--
-- ATENÇÃO — IMPRETERÍVEL antes de qualquer deploy: F5-2, F5-3, F5-4 e F5-14
-- são os testes que validam a garantia de isolamento ACID sob concorrência
-- REAL (advisory lock por colaborador + FOR UPDATE no plantão — SEC-ACID).
-- Nenhuma ferramenta estática (typecheck, lint, `prisma validate`, EXPLAIN)
-- prova isolamento sob concorrência — só execução real, com sessões de
-- banco de fato paralelas, prova ou refuta isso. Esses quatro cenários
-- PRECISAM rodar contra Postgres real (não mock, não SQLite, não pooler
-- serverless no meio — método de TST-002/07-testes/concorrencia.md) antes
-- de qualquer deploy que toque `marcar_extra`, `valida_descanso` ou as
-- constraints/índices dos quais dependem.
--
-- ARQUITETURA DESTE ARQUIVO (diferente de fn-003/fn-004.pgtap.sql, que são
-- um único BEGIN…ROLLBACK): F5-2/3/4/14 usam `dblink` para abrir sessões de
-- banco genuinamente separadas (é a única forma de gerar concorrência real
-- de dentro de um script SQL único — `pg_advisory_xact_lock` e `FOR UPDATE`
-- só serializam entre *sessões* distintas, não dentro da mesma transação).
-- Uma sessão dblink só enxerga dados *committed* da sessão que a abriu
-- (READ COMMITTED, sessões diferentes) — logo os fixtures usados pelas
-- partes concorrentes não podem viver dentro de um BEGIN…ROLLBACK que nunca
-- comita. Por isso:
--   • Parte A (F5-1, F5-5..F5-13, F5-15..F5-16): sequencial, cada teste em sua própria
--     transação curta que comita (não há necessidade de isolamento entre
--     eles — cada um usa fixtures com IDs próprios).
--   • Parte B (F5-2, F5-3, F5-4, F5-14): fixtures comitados, `dblink` abre N
--     conexões reais para chamar `marcar_extra` em paralelo de verdade,
--     resultado avaliado depois que todas as conexões terminam.
-- Ao final, limpeza explícita por `DELETE` (não `ROLLBACK`) usando o mesmo
-- prefixo de UUID desta suíte (…-0000-000000050XXX), para deixar o banco de
-- teste limpo para a próxima execução.
--
-- String de conexão do dblink (`dbname=' || current_database()`, sem
-- host/user/senha explícitos) assume auth local (peer/trust) — ajuste
-- host/user/password conforme o ambiente onde isto for executado
-- (`tests/pgtap/README` ainda não existe; documentar lá quando criado).
-- Se o ambiente-alvo não permitir `dblink` (ex.: Supabase gerenciado sem
-- superuser para a extensão), F5-2/3/4/14 têm que rodar pelo harness externo
-- TS + pool descrito em TST-002 (specs/07-testes/concorrencia.md, cenários
-- C1/C2/C3/C10) em vez deste arquivo — este arquivo é o melhor esforço
-- embutido em pgTAP, não substitui TST-002 quando dblink não está
-- disponível.
--
-- Identificadores: UUIDs literais só com dígitos hexadecimais (0-9a-f),
-- prefixo …-0000-000000050XXX (05 = FN-005), mesmo cuidado já registrado em
-- fn-004-valida-descanso.pgtap.sql.
-- ============================================================================

SELECT plan(25);

-- ----------------------------------------------------------------------------
-- Fixtures compartilhados (Parte A e Parte B). Comitados de propósito — ver
-- nota de arquitetura acima.
-- ----------------------------------------------------------------------------
INSERT INTO rt (id, nome) VALUES
  ('00000000-0000-0000-0000-000000050001', 'RT1 FN-005'),
  ('00000000-0000-0000-0000-000000050002', 'RT2 FN-005');

INSERT INTO codigo_escala (id, codigo, descricao, presenca, ocupa_horario, remunerada, cor) VALUES
  ('00000000-0000-0000-0000-000000050003', 'D', 'Disponível', true,  true,  true,  '#111111'),
  ('00000000-0000-0000-0000-000000050004', 'F', 'Folga',      false, false, false, '#222222');

-- Ciclo A: publicado, janela aberta, cruzada desligada no ciclo, extra em
-- folga desligado, limite_padrao=5, max_blocos_seguidos=2.
INSERT INTO ciclo (
  id, ano, mes, status, limite_padrao, permite_cruzada, permite_extra_em_folga,
  max_blocos_seguidos, abertura_marcacao, fechamento_marcacao
) VALUES (
  '00000000-0000-0000-0000-000000050005', 2026, 9, 'PUBLICADO', 5, false, false,
  2, now() - interval '1 day', now() + interval '30 days'
);

-- Nota: nenhum BEGIN explícito neste arquivo — cada statement acima e
-- abaixo roda em autocommit (padrão do psql/pg_prove), então cada fixture
-- fica visível para as sessões dblink da Parte B assim que o INSERT retorna.

-- ============================================================================
-- PARTE A — sequencial (F5-1, F5-5..F5-13, F5-15..F5-16)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- F5-1: caminho feliz → marcação criada, contador +1.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000050101', 'MAT9101', 'Colaborador F5-1', 'hash9101', '9101',
          '00000000-0000-0000-0000-000000050001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050102', '00000000-0000-0000-0000-000000050005',
          '00000000-0000-0000-0000-000000050001', '2026-09-10', 'DIURNO', '07:00', '19:00', 12, 1);

SELECT lives_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000050102'::uuid,
                          '00000000-0000-0000-0000-000000050101'::uuid) $$,
  'F5-1: caminho feliz não lança exceção'
);

SELECT is(
  (SELECT vagas_ocupadas FROM plantao WHERE id = '00000000-0000-0000-0000-000000050102'),
  1,
  'F5-1: contador do plantão incrementado para 1'
);

-- ----------------------------------------------------------------------------
-- F5-5: RT cruzada desligada (ciclo e plantão não liberam, participação
-- também não) → CRUZADA_BLOQUEADA.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000050201', 'MAT9102', 'Colaborador F5-5', 'hash9102', '9102',
          '00000000-0000-0000-0000-000000050002', 'DIURNO', '2026-01-01');

-- Plantão pertence à RT1; colaborador é da RT2 → cruzada.
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050202', '00000000-0000-0000-0000-000000050005',
          '00000000-0000-0000-0000-000000050001', '2026-09-11', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT throws_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000050202'::uuid,
                          '00000000-0000-0000-0000-000000050201'::uuid) $$,
  'CRUZADA_BLOQUEADA',
  'F5-5: cruzada desligada em todos os níveis → CRUZADA_BLOQUEADA'
);

-- ----------------------------------------------------------------------------
-- F5-6: cruzada liberada só na participação → permitido.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000050301', 'MAT9103', 'Colaborador F5-6', 'hash9103', '9103',
          '00000000-0000-0000-0000-000000050002', 'DIURNO', '2026-01-01');

INSERT INTO participacao_ciclo (id, ciclo_id, colaborador_id, permite_cruzada)
  VALUES ('00000000-0000-0000-0000-000000050302', '00000000-0000-0000-0000-000000050005',
          '00000000-0000-0000-0000-000000050301', true);

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050303', '00000000-0000-0000-0000-000000050005',
          '00000000-0000-0000-0000-000000050001', '2026-09-11', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT lives_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000050303'::uuid,
                          '00000000-0000-0000-0000-000000050301'::uuid) $$,
  'F5-6: cruzada liberada em participacao_ciclo → permitido'
);

-- ----------------------------------------------------------------------------
-- F5-7: dia com F, flag de extra-em-folga desligada (ciclo A) → EM_AUSENCIA.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000050401', 'MAT9104', 'Colaborador F5-7', 'hash9104', '9104',
          '00000000-0000-0000-0000-000000050001', 'DIURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data)
  VALUES ('00000000-0000-0000-0000-000000050402', '00000000-0000-0000-0000-000000050401',
          '00000000-0000-0000-0000-000000050005', '00000000-0000-0000-0000-000000050004',
          '2026-09-12');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050403', '00000000-0000-0000-0000-000000050005',
          '00000000-0000-0000-0000-000000050001', '2026-09-12', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT throws_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000050403'::uuid,
                          '00000000-0000-0000-0000-000000050401'::uuid) $$,
  'EM_AUSENCIA',
  'F5-7: dia com F, permite_extra_em_folga=false → EM_AUSENCIA'
);

-- ----------------------------------------------------------------------------
-- F5-8: dia com F, flag de extra-em-folga ligada (ciclo B) → permitido.
-- ----------------------------------------------------------------------------
INSERT INTO ciclo (
  id, ano, mes, status, limite_padrao, permite_cruzada, permite_extra_em_folga,
  max_blocos_seguidos, abertura_marcacao, fechamento_marcacao
) VALUES (
  '00000000-0000-0000-0000-000000050501', 2026, 10, 'PUBLICADO', 5, false, true,
  2, now() - interval '1 day', now() + interval '30 days'
);

INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000050502', 'MAT9105', 'Colaborador F5-8', 'hash9105', '9105',
          '00000000-0000-0000-0000-000000050001', 'DIURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data)
  VALUES ('00000000-0000-0000-0000-000000050503', '00000000-0000-0000-0000-000000050502',
          '00000000-0000-0000-0000-000000050501', '00000000-0000-0000-0000-000000050004',
          '2026-10-12');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050504', '00000000-0000-0000-0000-000000050501',
          '00000000-0000-0000-0000-000000050001', '2026-10-12', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT lives_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000050504'::uuid,
                          '00000000-0000-0000-0000-000000050502'::uuid) $$,
  'F5-8: dia com F, permite_extra_em_folga=true → permitido'
);

-- ----------------------------------------------------------------------------
-- F5-9: extra no mesmo turno do plantão base (escala D) → CONFLITO_DE_HORARIO
-- (via valida_descanso, FN-004, passo 8).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000050601', 'MAT9106', 'Colaborador F5-9', 'hash9106', '9106',
          '00000000-0000-0000-0000-000000050001', 'DIURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-000000050602', '00000000-0000-0000-0000-000000050601',
          '00000000-0000-0000-0000-000000050005', '00000000-0000-0000-0000-000000050003',
          '2026-09-13', '07:00', '19:00');

-- Plantão-extra no MESMO dia e MESMO turno (07:00-19:00) — sobreposição total.
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050603', '00000000-0000-0000-0000-000000050005',
          '00000000-0000-0000-0000-000000050001', '2026-09-13', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT throws_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000050603'::uuid,
                          '00000000-0000-0000-0000-000000050601'::uuid) $$,
  'CONFLITO_DE_HORARIO',
  'F5-9: extra sobre o mesmo turno da escala base → CONFLITO_DE_HORARIO'
);

-- ----------------------------------------------------------------------------
-- F5-10: turno adjacente (escala D diurno termina quando extra noturno
-- começa) → contíguo, dentro de max_blocos=2 → permitido.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000050701', 'MAT9107', 'Colaborador F5-10', 'hash9107', '9107',
          '00000000-0000-0000-0000-000000050001', 'DIURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-000000050702', '00000000-0000-0000-0000-000000050701',
          '00000000-0000-0000-0000-000000050005', '00000000-0000-0000-0000-000000050003',
          '2026-09-14', '07:00', '19:00');

-- Plantão-extra noturno, começa exatamente às 19:00 (contíguo, não sobreposto).
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050703', '00000000-0000-0000-0000-000000050005',
          '00000000-0000-0000-0000-000000050001', '2026-09-14', 'NOTURNO', '19:00', '07:00', 12, 5);

SELECT lives_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000050703'::uuid,
                          '00000000-0000-0000-0000-000000050701'::uuid) $$,
  'F5-10: turno adjacente (contíguo, 2 blocos, max_blocos=2) → permitido'
);

-- ----------------------------------------------------------------------------
-- F5-11: ciclo fechado no meio → CICLO_FECHADO, sem linha órfã.
-- ----------------------------------------------------------------------------
INSERT INTO ciclo (
  id, ano, mes, status, limite_padrao, permite_cruzada, permite_extra_em_folga,
  max_blocos_seguidos, abertura_marcacao, fechamento_marcacao
) VALUES (
  '00000000-0000-0000-0000-000000050801', 2026, 11, 'FECHADO', 5, false, false,
  2, now() - interval '1 day', now() + interval '30 days'
);

INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000050802', 'MAT9108', 'Colaborador F5-11', 'hash9108', '9108',
          '00000000-0000-0000-0000-000000050001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050803', '00000000-0000-0000-0000-000000050801',
          '00000000-0000-0000-0000-000000050001', '2026-11-10', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT throws_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000050803'::uuid,
                          '00000000-0000-0000-0000-000000050802'::uuid) $$,
  'CICLO_FECHADO',
  'F5-11: ciclo FECHADO → CICLO_FECHADO'
);

SELECT is(
  (SELECT count(*)::int FROM marcacao
    WHERE plantao_id = '00000000-0000-0000-0000-000000050803'),
  0,
  'F5-11: nenhuma linha de marcacao órfã após CICLO_FECHADO'
);

-- ----------------------------------------------------------------------------
-- F5-12: admin fora da janela (fechamento_marcacao no passado) → permitido
-- (RN-27: ADMIN pula só a checagem de janela).
-- ----------------------------------------------------------------------------
INSERT INTO ciclo (
  id, ano, mes, status, limite_padrao, permite_cruzada, permite_extra_em_folga,
  max_blocos_seguidos, abertura_marcacao, fechamento_marcacao
) VALUES (
  '00000000-0000-0000-0000-000000050901', 2026, 12, 'PUBLICADO', 5, false, false,
  2, now() - interval '60 days', now() - interval '1 day'
);

INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000050902', 'MAT9109', 'Colaborador F5-12', 'hash9109', '9109',
          '00000000-0000-0000-0000-000000050001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050903', '00000000-0000-0000-0000-000000050901',
          '00000000-0000-0000-0000-000000050001', '2026-12-10', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT lives_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000050903'::uuid,
                          '00000000-0000-0000-0000-000000050902'::uuid, 'ADMIN'::origem_marcacao) $$,
  'F5-12: origem ADMIN fora da janela de marcação → permitido'
);

-- ----------------------------------------------------------------------------
-- F5-13: admin criando 36h (3º bloco contíguo, max_blocos=2) → EXCEDE_JORNADA
-- mesmo para ADMIN (janela é a ÚNICA checagem que ADMIN pula).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000050a01', 'MAT9110', 'Colaborador F5-13', 'hash9110', '9110',
          '00000000-0000-0000-0000-000000050001', 'NOTURNO', '2026-01-01');

-- Dois blocos já ocupados e contíguos: 09-15 07:00-19:00, 09-15 19:00 - 09-16 07:00.
INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES
    ('00000000-0000-0000-0000-000000050a02', '00000000-0000-0000-0000-000000050a01',
     '00000000-0000-0000-0000-000000050005', '00000000-0000-0000-0000-000000050003',
     '2026-09-15', '07:00', '19:00'),
    ('00000000-0000-0000-0000-000000050a03', '00000000-0000-0000-0000-000000050a01',
     '00000000-0000-0000-0000-000000050005', '00000000-0000-0000-0000-000000050003',
     '2026-09-15', '19:00', '07:00');

-- 3º bloco contíguo (09-16 07:00-19:00), marcado por ADMIN → fecha 36h,
-- excede max_blocos_seguidos=2 do ciclo A.
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050a04', '00000000-0000-0000-0000-000000050005',
          '00000000-0000-0000-0000-000000050001', '2026-09-16', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT throws_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000050a04'::uuid,
                          '00000000-0000-0000-0000-000000050a01'::uuid, 'ADMIN'::origem_marcacao) $$,
  'EXCEDE_JORNADA',
  'F5-13: ADMIN formando 3º bloco contíguo (36h, max_blocos=2) → EXCEDE_JORNADA'
);

-- ----------------------------------------------------------------------------
-- F5-15: RN-16 estendida (pedido do usuário, ver 20260906130000_fn005_fn007_
-- ausencia_turno_seguinte). Colaborador NOTURNO com folga (F) registrada em
-- 2026-09-20; extra NOTURNA em 2026-09-19 (19:00 → 20/09 07:00) "termina"
-- dentro da madrugada do dia de folga → EM_AUSENCIA mesmo sem sobreposição
-- literal de horário com o intervalo interno de escala_dia do dia 20.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000050b01', 'MAT9111', 'Colaborador F5-15', 'hash9111', '9111',
          '00000000-0000-0000-0000-000000050001', 'NOTURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-000000050b02', '00000000-0000-0000-0000-000000050b01',
          '00000000-0000-0000-0000-000000050005', '00000000-0000-0000-0000-000000050004',
          '2026-09-20', '19:00', '07:00');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050b03', '00000000-0000-0000-0000-000000050005',
          '00000000-0000-0000-0000-000000050001', '2026-09-19', 'NOTURNO', '19:00', '07:00', 12, 5);

SELECT throws_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000050b03'::uuid,
                          '00000000-0000-0000-0000-000000050b01'::uuid) $$,
  'EM_AUSENCIA',
  'F5-15: extra NOTURNA na véspera (19/09) de dia com F (20/09) → EM_AUSENCIA'
);

-- ----------------------------------------------------------------------------
-- F5-16 (controle negativo): mesma véspera (19/09), mesmo colaborador, mas
-- extra DIURNA (07:00 → 19:00) nunca cruza a meia-noite → não deve olhar o
-- dia seguinte, permanece permitido.
-- ----------------------------------------------------------------------------
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050b04', '00000000-0000-0000-0000-000000050005',
          '00000000-0000-0000-0000-000000050001', '2026-09-19', 'DIURNO', '07:00', '19:00', 12, 5);

SELECT lives_ok(
  $$ SELECT marcar_extra('00000000-0000-0000-0000-000000050b04'::uuid,
                          '00000000-0000-0000-0000-000000050b01'::uuid) $$,
  'F5-16: extra DIURNA na véspera de um F não cruza a meia-noite → permitido (controle negativo)'
);

-- ============================================================================
-- PARTE B — concorrência real via dblink (F5-2, F5-3, F5-4, F5-14)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS dblink;

-- ----------------------------------------------------------------------------
-- F5-2: 20 chamadas paralelas para 1 vaga → 1 sucesso, 19 SEM_VAGA,
-- contador = 1.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  SELECT ('00000000-0000-0000-0000-0000000502' || lpad(to_hex(g), 2, '0'))::uuid,
         'MATF52' || lpad(g::text, 2, '0'), 'Colaborador F5-2 #' || g,
         'hashf52' || g, lpad(g::text, 4, '0'),
         '00000000-0000-0000-0000-000000050001', 'DIURNO', '2026-01-01'
    FROM generate_series(1, 20) g;

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050bb1', '00000000-0000-0000-0000-000000050005',
          '00000000-0000-0000-0000-000000050001', '2026-09-17', 'DIURNO', '07:00', '19:00', 12, 1);

DO $$
DECLARE
  g int;
  v_colab uuid;
BEGIN
  FOR g IN 1..20 LOOP
    v_colab := ('00000000-0000-0000-0000-0000000502' || lpad(to_hex(g), 2, '0'))::uuid;
    PERFORM dblink_connect('f52_' || g, 'dbname=' || current_database());
    PERFORM dblink_send_query('f52_' || g,
      format('SELECT (marcar_extra(%L::uuid, %L::uuid)).id::text',
             '00000000-0000-0000-0000-000000050bb1', v_colab));
  END LOOP;
END $$;

CREATE TEMP TABLE __f52_resultados__ (g int, ok boolean, erro text);
DO $$
DECLARE
  g int;
  v_row record;
  v_erro text;
BEGIN
  FOR g IN 1..20 LOOP
    BEGIN
      SELECT * INTO v_row FROM dblink_get_result('f52_' || g) AS t(id text);
      INSERT INTO __f52_resultados__ VALUES (g, true, NULL);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
      INSERT INTO __f52_resultados__ VALUES (g, false, v_erro);
    END;
    PERFORM dblink_disconnect('f52_' || g);
  END LOOP;
END $$;

SELECT is(
  (SELECT count(*)::int FROM __f52_resultados__ WHERE ok),
  1,
  'F5-2: exatamente 1 sucesso entre 20 chamadas paralelas por 1 vaga'
);

SELECT is(
  (SELECT count(*)::int FROM __f52_resultados__ WHERE NOT ok AND erro LIKE '%SEM_VAGA%'),
  19,
  'F5-2: as outras 19 falham com SEM_VAGA'
);

SELECT is(
  (SELECT vagas_ocupadas FROM plantao WHERE id = '00000000-0000-0000-0000-000000050bb1'),
  1,
  'F5-2: contador do plantão = 1 após a corrida'
);

-- ----------------------------------------------------------------------------
-- F5-3: 5 chamadas paralelas, mesmo colaborador, limite com 1 vaga restante
-- (limite_padrao=1 no ciclo A, 0 usadas) → 1 sucesso, 4 LIMITE_ATINGIDO.
-- ----------------------------------------------------------------------------
INSERT INTO ciclo (
  id, ano, mes, status, limite_padrao, permite_cruzada, permite_extra_em_folga,
  max_blocos_seguidos, abertura_marcacao, fechamento_marcacao
) VALUES (
  '00000000-0000-0000-0000-000000050c00', 2027, 1, 'PUBLICADO', 1, false, false,
  2, now() - interval '1 day', now() + interval '30 days'
);

INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000050c01', 'MATF53', 'Colaborador F5-3', 'hashf53', '9200',
          '00000000-0000-0000-0000-000000050001', 'DIURNO', '2026-01-01');

INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  SELECT ('00000000-0000-0000-0000-0000000503' || lpad(to_hex(g), 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000050c00', '00000000-0000-0000-0000-000000050001',
         ('2027-01-1' || g)::date, 'DIURNO', '07:00', '19:00', 12, 5
    FROM generate_series(1, 5) g;

DO $$
DECLARE
  g int;
  v_plantao uuid;
BEGIN
  FOR g IN 1..5 LOOP
    v_plantao := ('00000000-0000-0000-0000-0000000503' || lpad(to_hex(g), 2, '0'))::uuid;
    PERFORM dblink_connect('f53_' || g, 'dbname=' || current_database());
    PERFORM dblink_send_query('f53_' || g,
      format('SELECT (marcar_extra(%L::uuid, %L::uuid)).id::text',
             v_plantao, '00000000-0000-0000-0000-000000050c01'));
  END LOOP;
END $$;

CREATE TEMP TABLE __f53_resultados__ (g int, ok boolean, erro text);
DO $$
DECLARE
  g int;
  v_row record;
  v_erro text;
BEGIN
  FOR g IN 1..5 LOOP
    BEGIN
      SELECT * INTO v_row FROM dblink_get_result('f53_' || g) AS t(id text);
      INSERT INTO __f53_resultados__ VALUES (g, true, NULL);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
      INSERT INTO __f53_resultados__ VALUES (g, false, v_erro);
    END;
    PERFORM dblink_disconnect('f53_' || g);
  END LOOP;
END $$;

SELECT is(
  (SELECT count(*)::int FROM __f53_resultados__ WHERE ok),
  1,
  'F5-3: exatamente 1 sucesso entre 5 paralelas com limite=1'
);

SELECT is(
  (SELECT count(*)::int FROM __f53_resultados__ WHERE NOT ok AND erro LIKE '%LIMITE_ATINGIDO%'),
  4,
  'F5-3: as outras 4 falham com LIMITE_ATINGIDO'
);

SELECT is(
  (SELECT count(*)::int FROM marcacao m JOIN plantao p ON p.id = m.plantao_id
    WHERE m.colaborador_id = '00000000-0000-0000-0000-000000050c01' AND m.status = 'CONFIRMADA'
      AND p.ciclo_id = '00000000-0000-0000-0000-000000050c00'),
  1,
  'F5-3: exatamente 1 marcação confirmada no ciclo, respeitando o limite'
);

-- ----------------------------------------------------------------------------
-- F5-4: 2 chamadas paralelas formando juntas 36h (3º bloco contíguo,
-- max_blocos=2) → uma passa, a outra EXCEDE_JORNADA (o advisory lock por
-- colaborador serializa; a segunda enxerga, dentro da sua transação, o
-- bloco que a primeira já comitou).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000050d01', 'MATF54', 'Colaborador F5-4', 'hashf54', '9300',
          '00000000-0000-0000-0000-000000050001', 'NOTURNO', '2026-01-01');

-- Um bloco já ocupado: 09-18 07:00-19:00 (escala D).
INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-000000050d02', '00000000-0000-0000-0000-000000050d01',
          '00000000-0000-0000-0000-000000050005', '00000000-0000-0000-0000-000000050003',
          '2026-09-18', '07:00', '19:00');

-- Dois plantões-extra concorrentes, ambos contíguos ao bloco existente e
-- entre si formariam 3 blocos (36h) se os dois passassem: um antes
-- (09-17 19:00-09-18 07:00) e um depois (09-18 19:00-09-19 07:00).
-- Isoladamente cada um forma só 2 blocos (permitido); juntos, 3 (excede).
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES
    ('00000000-0000-0000-0000-000000050d03', '00000000-0000-0000-0000-000000050005',
     '00000000-0000-0000-0000-000000050001', '2026-09-17', 'NOTURNO', '19:00', '07:00', 12, 5),
    ('00000000-0000-0000-0000-000000050d04', '00000000-0000-0000-0000-000000050005',
     '00000000-0000-0000-0000-000000050001', '2026-09-18', 'NOTURNO', '19:00', '07:00', 12, 5);

DO $$
BEGIN
  PERFORM dblink_connect('f54_a', 'dbname=' || current_database());
  PERFORM dblink_connect('f54_b', 'dbname=' || current_database());
  PERFORM dblink_send_query('f54_a',
    format('SELECT (marcar_extra(%L::uuid, %L::uuid)).id::text',
           '00000000-0000-0000-0000-000000050d03', '00000000-0000-0000-0000-000000050d01'));
  PERFORM dblink_send_query('f54_b',
    format('SELECT (marcar_extra(%L::uuid, %L::uuid)).id::text',
           '00000000-0000-0000-0000-000000050d04', '00000000-0000-0000-0000-000000050d01'));
END $$;

CREATE TEMP TABLE __f54_resultados__ (conn text, ok boolean, erro text);
DO $$
DECLARE
  v_row record;
  v_erro text;
  c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['f54_a', 'f54_b'] LOOP
    BEGIN
      SELECT * INTO v_row FROM dblink_get_result(c) AS t(id text);
      INSERT INTO __f54_resultados__ VALUES (c, true, NULL);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
      INSERT INTO __f54_resultados__ VALUES (c, false, v_erro);
    END;
    PERFORM dblink_disconnect(c);
  END LOOP;
END $$;

SELECT is(
  (SELECT count(*)::int FROM __f54_resultados__ WHERE ok),
  1,
  'F5-4: exatamente 1 das 2 chamadas paralelas passa'
);

SELECT is(
  (SELECT count(*)::int FROM __f54_resultados__ WHERE NOT ok AND erro LIKE '%EXCEDE_JORNADA%'),
  1,
  'F5-4: a outra falha com EXCEDE_JORNADA (36h detectada só depois do commit da primeira)'
);

-- ----------------------------------------------------------------------------
-- F5-14: carga concorrente sem deadlock. NOTA DE ESCOPO: a spec pede "2h de
-- carga concorrente" — inviável dentro de uma execução de `pg_prove` de CI.
-- Este bloco faz uma rajada reduzida (50 chamadas paralelas via dblink,
-- mistura de sucesso e falha de negócio esperada, mesmo plantão e limite
-- pequenos de propósito para maximizar contenção) e verifica
-- `pg_stat_database.deadlocks` antes/depois. A suíte de carga sustentada de
-- 2h real é TST-002/C10 (specs/07-testes/concorrencia.md) — executada
-- separadamente, fora de pgTAP, com o harness Promise.all + pool próprio.
-- Este bloco aqui é um smoke test de deadlock, não substitui C10.
-- ----------------------------------------------------------------------------
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000050e01', '00000000-0000-0000-0000-000000050005',
          '00000000-0000-0000-0000-000000050001', '2026-09-19', 'DIURNO', '07:00', '19:00', 12, 10);

INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  SELECT ('00000000-0000-0000-0000-0000000502' || lpad(to_hex(100 + g), 3, '0'))::uuid,
         'MATF514' || lpad(g::text, 3, '0'), 'Colaborador F5-14 #' || g,
         'hashf514' || g, lpad(g::text, 4, '0'),
         '00000000-0000-0000-0000-000000050001', 'DIURNO', '2026-01-01'
    FROM generate_series(1, 50) g;

SELECT (sum(deadlocks))::bigint AS antes
  INTO TEMP __f514_deadlocks_antes__
  FROM pg_stat_database WHERE datname = current_database();

DO $$
DECLARE
  g int;
  v_colab uuid;
BEGIN
  FOR g IN 1..50 LOOP
    v_colab := ('00000000-0000-0000-0000-0000000502' || lpad(to_hex(100 + g), 3, '0'))::uuid;
    PERFORM dblink_connect('f514_' || g, 'dbname=' || current_database());
    PERFORM dblink_send_query('f514_' || g,
      format('SELECT (marcar_extra(%L::uuid, %L::uuid)).id::text',
             '00000000-0000-0000-0000-000000050e01', v_colab));
  END LOOP;
  FOR g IN 1..50 LOOP
    BEGIN
      PERFORM dblink_get_result('f514_' || g);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- falhas de negócio (SEM_VAGA a partir da 11ª) são esperadas
    END;
    PERFORM dblink_disconnect('f514_' || g);
  END LOOP;
END $$;

SELECT is(
  (SELECT deadlocks_antes.antes IS NOT DISTINCT FROM (
     SELECT sum(deadlocks) FROM pg_stat_database WHERE datname = current_database()
   ) FROM __f514_deadlocks_antes__ AS deadlocks_antes),
  true,
  'F5-14: rajada de 50 chamadas concorrentes não incrementa pg_stat_database.deadlocks'
);

SELECT is(
  (SELECT vagas_ocupadas <= vagas_totais FROM plantao WHERE id = '00000000-0000-0000-0000-000000050e01'),
  true,
  'F5-14: invariante 0 ≤ vagas_ocupadas ≤ vagas_totais preservado sob carga'
);

SELECT * FROM finish();

-- ----------------------------------------------------------------------------
-- Limpeza explícita (não há ROLLBACK — ver nota de arquitetura no topo).
-- Ordem respeita FKs: marcacao/escala_dia → plantao/participacao_ciclo →
-- colaborador/ciclo → codigo_escala/rt.
-- ----------------------------------------------------------------------------
DELETE FROM marcacao WHERE colaborador_id IN (
  SELECT id FROM colaborador WHERE rt_id IN (
    '00000000-0000-0000-0000-000000050001', '00000000-0000-0000-0000-000000050002'
  )
);
DELETE FROM escala_dia WHERE colaborador_id IN (
  SELECT id FROM colaborador WHERE rt_id IN (
    '00000000-0000-0000-0000-000000050001', '00000000-0000-0000-0000-000000050002'
  )
);
DELETE FROM participacao_ciclo WHERE ciclo_id::text LIKE '00000000-0000-0000-0000-00000005%';
DELETE FROM plantao WHERE ciclo_id::text LIKE '00000000-0000-0000-0000-00000005%';
DELETE FROM colaborador WHERE rt_id IN (
  '00000000-0000-0000-0000-000000050001', '00000000-0000-0000-0000-000000050002'
);
DELETE FROM ciclo WHERE id::text LIKE '00000000-0000-0000-0000-00000005%';
DELETE FROM codigo_escala WHERE id::text LIKE '00000000-0000-0000-0000-00000005%';
DELETE FROM rt WHERE id IN (
  '00000000-0000-0000-0000-000000050001', '00000000-0000-0000-0000-000000050002'
);

DROP TABLE IF EXISTS __f52_resultados__;
DROP TABLE IF EXISTS __f53_resultados__;
DROP TABLE IF EXISTS __f54_resultados__;
DROP TABLE IF EXISTS __f514_deadlocks_antes__;
