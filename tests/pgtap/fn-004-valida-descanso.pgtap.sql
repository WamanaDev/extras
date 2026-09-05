-- ============================================================================
-- PENDENTE DE EXECUÇÃO NESTE AMBIENTE (mesma nota de fn-003-blocos-ocupados.pgtap.sql)
-- ============================================================================
-- Testes pgTAP para specs/03-banco/funcoes/fn-004-valida-descanso.md (FN-004),
-- seção "Testes de aceitação": F4-1..F4-9. Este ambiente de agente não tem
-- Docker daemon acessível (`docker ps` falha: "failed to connect to the
-- docker API ... daemon is running?") nem `pg_prove`/extensão `pgtap`
-- instalados localmente, então este arquivo NÃO FOI EXECUTADO — escrito e
-- pronto para rodar assim que:
--   1. `docker compose -f docker-compose.dev.yml up -d` subir o Postgres 15
--      local (porta 5432);
--   2. `prisma migrate deploy` tiver aplicado até
--      20260101000007_funcoes (esta migration, com `blocos_ocupados` e
--      `valida_descanso`);
--   3. A extensão `pgtap` estiver instalada no banco de teste
--      (`CREATE EXTENSION pgtap;`), e rodar via
--      `pg_prove -d <db_teste> tests/pgtap/fn-004-valida-descanso.pgtap.sql`.
--
-- Cobre F4-1..F4-9 na mesma ordem da tabela de fn-004-valida-descanso.md.
--
-- F4-10 (1000 cenários TS×SQL, semente fixa, comparando `validaDescanso` de
-- src/lib/escala/blocos.ts contra esta função) NÃO é escopo deste arquivo —
-- é TST-003 (specs/07-testes/paridade-escala.md, Parte 2), uma onda de
-- testes separada, com gerador e harness próprios (provavelmente TS via
-- Vitest + client de banco, para poder rodar o mesmo TS que a UI usa lado a
-- lado com o SQL). Não implementado aqui.
--
-- Identificadores: todos os UUIDs literais usam apenas dígitos hexadecimais
-- (0-9a-f) — diferente do padrão mnemônico (`...p1`, `...m1`) usado em
-- fn-003-blocos-ocupados.pgtap.sql, que contém caracteres fora do alfabeto
-- hexadecimal ('p', 'm') e portanto seria rejeitado por
-- `invalid input syntax for type uuid` se executado como está. Não é escopo
-- desta tarefa corrigir aquele arquivo (FN-003, de outro agente); apenas
-- este arquivo novo evita repetir o problema.
-- ============================================================================

BEGIN;
SELECT plan(9);

SET LOCAL TIME ZONE 'America/Sao_Paulo';

INSERT INTO rt (id, nome) VALUES ('00000000-0000-0000-0000-000000040001', 'RT FN-004');

-- Códigos: D (presenca+ocupaHorario), F (nem uma nem outra), FT
-- (presenca=false, ocupaHorario=true).
INSERT INTO codigo_escala (id, codigo, descricao, presenca, ocupa_horario, remunerada, cor) VALUES
  ('00000000-0000-0000-0000-000000040002', 'D',  'Disponível',        true,  true,  true,  '#111111'),
  ('00000000-0000-0000-0000-000000040003', 'F',  'Folga',             false, false, false, '#222222'),
  ('00000000-0000-0000-0000-000000040004', 'FT', 'Folga Treinamento', false, true,  true,  '#333333');

INSERT INTO ciclo (id, ano, mes, limite_padrao)
  VALUES ('00000000-0000-0000-0000-000000040005', 2026, 9, 5);

-- Plantão-extra diurno D2, usado pela marcação de F4-4.
INSERT INTO plantao (id, ciclo_id, rt_id, data, tipo, hora_inicio, hora_fim, carga_horas, vagas_totais)
  VALUES ('00000000-0000-0000-0000-000000040006', '00000000-0000-0000-0000-000000040005',
          '00000000-0000-0000-0000-000000040001', '2026-09-02', 'DIURNO', '07:00', '19:00', 12, 5);

-- ----------------------------------------------------------------------------
-- F4-1: extra noturno D2, base (escala) noturno D2 → CONFLITO_DE_HORARIO
-- (mesmo intervalo exato — sobreposição total).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000040007', 'MAT9041', 'Colaborador F4-1', 'hash9041', '9041',
          '00000000-0000-0000-0000-000000040001', 'NOTURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-000000040008', '00000000-0000-0000-0000-000000040007',
          '00000000-0000-0000-0000-000000040005', '00000000-0000-0000-0000-000000040002',
          '2026-09-02', '19:00', '07:00');

SELECT is(
  valida_descanso(
    '00000000-0000-0000-0000-000000040007',
    '2026-09-02 19:00:00-03'::timestamptz, '2026-09-03 07:00:00-03'::timestamptz, 2),
  'CONFLITO_DE_HORARIO',
  'F4-1: extra noturno D2 sobre base noturno D2 → CONFLITO_DE_HORARIO'
);

-- ----------------------------------------------------------------------------
-- F4-2: extra diurno D2, base noturno D2 → NULL (blocos contíguos: diurno
-- D2 07-19 termina exatamente quando noturno D2 19-07 começa — 2 blocos,
-- dentro do max_blocos=2, sem sobreposição).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000040009', 'MAT9042', 'Colaborador F4-2', 'hash9042', '9042',
          '00000000-0000-0000-0000-000000040001', 'NOTURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-00000004000a', '00000000-0000-0000-0000-000000040009',
          '00000000-0000-0000-0000-000000040005', '00000000-0000-0000-0000-000000040002',
          '2026-09-02', '19:00', '07:00');

SELECT is(
  valida_descanso(
    '00000000-0000-0000-0000-000000040009',
    '2026-09-02 07:00:00-03'::timestamptz, '2026-09-02 19:00:00-03'::timestamptz, 2),
  NULL,
  'F4-2: extra diurno D2 antes de base noturno D2 → NULL (contíguo, 2 blocos)'
);

-- ----------------------------------------------------------------------------
-- F4-3: extra diurno D3, base noturno D2 → NULL (diurno D3 07-19 começa
-- exatamente quando noturno D2 19(D2)-07(D3) termina — contíguo, 2 blocos).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-00000004000b', 'MAT9043', 'Colaborador F4-3', 'hash9043', '9043',
          '00000000-0000-0000-0000-000000040001', 'NOTURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-00000004000c', '00000000-0000-0000-0000-00000004000b',
          '00000000-0000-0000-0000-000000040005', '00000000-0000-0000-0000-000000040002',
          '2026-09-02', '19:00', '07:00');

SELECT is(
  valida_descanso(
    '00000000-0000-0000-0000-00000004000b',
    '2026-09-03 07:00:00-03'::timestamptz, '2026-09-03 19:00:00-03'::timestamptz, 2),
  NULL,
  'F4-3: extra diurno D3 depois de base noturno D2 → NULL (contíguo, 2 blocos)'
);

-- ----------------------------------------------------------------------------
-- F4-4: base noturno D2 + extra diurno D2 (F4-2, já confirmada como
-- marcação) + tentativa de extra diurno D3 → EXCEDE_JORNADA ao formar o 3º
-- bloco contíguo (max_blocos=2).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-00000004000d', 'MAT9044', 'Colaborador F4-4', 'hash9044', '9044',
          '00000000-0000-0000-0000-000000040001', 'NOTURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-00000004000e', '00000000-0000-0000-0000-00000004000d',
          '00000000-0000-0000-0000-000000040005', '00000000-0000-0000-0000-000000040002',
          '2026-09-02', '19:00', '07:00');

INSERT INTO marcacao (id, plantao_id, colaborador_id, status, origem, cruzada)
  VALUES ('00000000-0000-0000-0000-00000004000f', '00000000-0000-0000-0000-000000040006',
          '00000000-0000-0000-0000-00000004000d', 'CONFIRMADA', 'PROPRIA', false);

SELECT is(
  valida_descanso(
    '00000000-0000-0000-0000-00000004000d',
    '2026-09-03 07:00:00-03'::timestamptz, '2026-09-03 19:00:00-03'::timestamptz, 2),
  'EXCEDE_JORNADA',
  'F4-4: 3º bloco contíguo (diurno D3) com max_blocos=2 → EXCEDE_JORNADA'
);

-- ----------------------------------------------------------------------------
-- F4-5: dia com FT (ocupa_horario=true, presenca=false) participa da
-- contagem de contiguidade — formar 3 blocos com FT no meio → EXCEDE_JORNADA.
-- FT em D2 (19-07, mesmo horário de um noturno) entre base noturno D1 e
-- extra diurno D3.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000040010', 'MAT9045', 'Colaborador F4-5', 'hash9045', '9045',
          '00000000-0000-0000-0000-000000040001', 'NOTURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES
    ('00000000-0000-0000-0000-000000040011', '00000000-0000-0000-0000-000000040010',
     '00000000-0000-0000-0000-000000040005', '00000000-0000-0000-0000-000000040002',
     '2026-09-01', '19:00', '07:00'),
    ('00000000-0000-0000-0000-000000040012', '00000000-0000-0000-0000-000000040010',
     '00000000-0000-0000-0000-000000040005', '00000000-0000-0000-0000-000000040004',
     '2026-09-02', '19:00', '07:00');

SELECT is(
  valida_descanso(
    '00000000-0000-0000-0000-000000040010',
    '2026-09-03 07:00:00-03'::timestamptz, '2026-09-03 19:00:00-03'::timestamptz, 2),
  'EXCEDE_JORNADA',
  'F4-5: dia com FT conta na contiguidade → 3 blocos formados → EXCEDE_JORNADA'
);

-- ----------------------------------------------------------------------------
-- F4-6: dia com F (presenca=false, ocupa_horario=false) → não gera bloco,
-- não interfere na contiguidade nem na sobreposição → NULL.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000040013', 'MAT9046', 'Colaborador F4-6', 'hash9046', '9046',
          '00000000-0000-0000-0000-000000040001', 'DIURNO', '2026-01-01');

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-000000040014', '00000000-0000-0000-0000-000000040013',
          '00000000-0000-0000-0000-000000040005', '00000000-0000-0000-0000-000000040003',
          '2026-09-02', NULL, NULL);

SELECT is(
  valida_descanso(
    '00000000-0000-0000-0000-000000040013',
    '2026-09-02 07:00:00-03'::timestamptz, '2026-09-02 19:00:00-03'::timestamptz, 2),
  NULL,
  'F4-6: dia com F não ocupa horário → NULL'
);

-- ----------------------------------------------------------------------------
-- F4-7: blocos com 1h de folga entre eles → não contíguos (igualdade exata
-- de timestamp falha) → corrida reinicia → NULL.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000040015', 'MAT9047', 'Colaborador F4-7', 'hash9047', '9047',
          '00000000-0000-0000-0000-000000040001', 'DIURNO', '2026-01-01');

-- Bloco existente 07:00-19:00 em 2026-09-02; novo bloco começa às 20:00
-- (1h de folga após as 19:00) em vez de 19:00 (contíguo).
INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-000000040016', '00000000-0000-0000-0000-000000040015',
          '00000000-0000-0000-0000-000000040005', '00000000-0000-0000-0000-000000040002',
          '2026-09-02', '07:00', '19:00');

SELECT is(
  valida_descanso(
    '00000000-0000-0000-0000-000000040015',
    '2026-09-02 20:00:00-03'::timestamptz, '2026-09-03 08:00:00-03'::timestamptz, 1),
  NULL,
  'F4-7: 1h de folga entre blocos → não contíguo (igualdade exata) → NULL'
);

-- ----------------------------------------------------------------------------
-- F4-8: max_blocos = 3 → cadeia de 36h (3 blocos de 12h contíguos) permitida;
-- cadeia de 48h (4 blocos) não.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-000000040017', 'MAT9048', 'Colaborador F4-8', 'hash9048', '9048',
          '00000000-0000-0000-0000-000000040001', 'DIURNO', '2026-01-01');

-- Dois blocos já existentes contíguos: 09-01 07:00-19:00, 09-01 19:00 - 09-02 07:00.
INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES
    ('00000000-0000-0000-0000-000000040018', '00000000-0000-0000-0000-000000040017',
     '00000000-0000-0000-0000-000000040005', '00000000-0000-0000-0000-000000040002',
     '2026-09-01', '07:00', '19:00'),
    ('00000000-0000-0000-0000-000000040019', '00000000-0000-0000-0000-000000040017',
     '00000000-0000-0000-0000-000000040005', '00000000-0000-0000-0000-000000040002',
     '2026-09-01', '19:00', '07:00');

-- 3º bloco contíguo (09-02 07:00-19:00) fecha 36h → permitido com max_blocos=3.
SELECT is(
  valida_descanso(
    '00000000-0000-0000-0000-000000040017',
    '2026-09-02 07:00:00-03'::timestamptz, '2026-09-02 19:00:00-03'::timestamptz, 3),
  NULL,
  'F4-8a: max_blocos=3, 36h contíguas (3 blocos) → permitido'
);

INSERT INTO escala_dia (id, colaborador_id, ciclo_id, codigo_escala_id, data, hora_inicio, hora_fim)
  VALUES ('00000000-0000-0000-0000-00000004001a', '00000000-0000-0000-0000-000000040017',
          '00000000-0000-0000-0000-000000040005', '00000000-0000-0000-0000-000000040002',
          '2026-09-02', '07:00', '19:00');

-- 4º bloco contíguo (09-02 19:00-09-03 07:00) fecharia 48h → excede max_blocos=3.
SELECT is(
  valida_descanso(
    '00000000-0000-0000-0000-000000040017',
    '2026-09-02 19:00:00-03'::timestamptz, '2026-09-03 07:00:00-03'::timestamptz, 3),
  'EXCEDE_JORNADA',
  'F4-8b: max_blocos=3, 48h contíguas (4 blocos) → EXCEDE_JORNADA'
);

-- ----------------------------------------------------------------------------
-- F4-9: colaborador sem nenhum bloco ocupado → NULL (nem sobreposição, nem
-- contiguidade — cadeia de 1 bloco só, o novo).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora)
  VALUES ('00000000-0000-0000-0000-00000004001b', 'MAT9049', 'Colaborador F4-9', 'hash9049', '9049',
          '00000000-0000-0000-0000-000000040001', 'DIURNO', '2026-01-01');

SELECT is(
  valida_descanso(
    '00000000-0000-0000-0000-00000004001b',
    '2026-09-15 07:00:00-03'::timestamptz, '2026-09-15 19:00:00-03'::timestamptz, 2),
  NULL,
  'F4-9: colaborador sem nenhum bloco → NULL'
);

SELECT * FROM finish();
ROLLBACK;
