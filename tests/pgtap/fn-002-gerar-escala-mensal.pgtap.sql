-- ============================================================================
-- PENDENTE DE EXECUÇÃO NESTE AMBIENTE (mesma nota de fn-003/fn-004/fn-005.pgtap.sql)
-- ============================================================================
-- Testes pgTAP para specs/03-banco/funcoes/fn-002-gerar-escala-mensal.md
-- (FN-002), seção "Testes de aceitação": F2-1..F2-9. Este ambiente de agente
-- não tem Docker daemon acessível (`docker ps` falha: "failed to connect to
-- the docker API ... daemon is running?") nem `pg_prove`/extensão `pgtap`
-- instalados localmente, então este arquivo NÃO FOI EXECUTADO — escrito e
-- pronto para rodar assim que:
--   1. `docker compose -f docker-compose.dev.yml up -d` subir o Postgres 15
--      local (porta 5432);
--   2. `prisma migrate deploy` tiver aplicado até 20260101000007_funcoes
--      (esta migration, com `gerar_escala_mensal`);
--   3. As extensões `pgtap` e `dblink` estiverem instaladas no banco de teste
--      (`CREATE EXTENSION pgtap; CREATE EXTENSION dblink;` — `dblink` só é
--      necessária para F2-8, concorrência real), e rodar via
--      `pg_prove -d <db_teste> tests/pgtap/fn-002-gerar-escala-mensal.pgtap.sql`.
--
-- ARQUITETURA (mesmo motivo de fn-005-marcar-extra.pgtap.sql): F2-8 exige
-- concorrência REAL entre sessões (o `FOR UPDATE` no ciclo só serializa
-- entre sessões distintas, não dentro da mesma transação), e uma sessão
-- dblink só enxerga dados *committed*. Por isso este arquivo não usa
-- BEGIN…ROLLBACK global — cada statement roda em autocommit (padrão do
-- psql/pg_prove):
--   • Parte A (F2-1..F2-7, F2-9): sequencial, fixtures com IDs próprios por
--     teste, cada ciclo gerado uma vez (ou duas, para F2-4/F2-5) e inspecionado.
--   • Parte B (F2-8): fixtures comitados, `dblink` abre 2 conexões reais para
--     chamar `gerar_escala_mensal` em paralelo de verdade no mesmo ciclo.
-- Limpeza final por `DELETE`, não `ROLLBACK`, usando o prefixo desta suíte
-- (…-0000-000000020XXX, 02 = FN-002).
--
-- Nota sobre F2-7 (ver _conflitos.md, item 7c): a spec espera um colaborador
-- "sem âncora" pulado sem erro, mas `colaborador.escala_ancora` e
-- `turno_padrao` são `NOT NULL` no schema real (migration 003_tabelas) — não
-- é possível inserir esse colaborador para exercitar o cenário. F2-7 é
-- marcado com `skip()` em vez de simular um estado que a base não permite.
--
-- Identificadores: UUIDs literais só com dígitos hexadecimais (0-9a-f),
-- prefixo …-0000-000000020XXX, mesmo cuidado de fn-004/fn-005.pgtap.sql.
-- ============================================================================

SELECT plan(14);

-- ----------------------------------------------------------------------------
-- Fixtures compartilhados (RT + código D, comitados de propósito — Parte B
-- precisa enxergá-los via dblink).
-- ----------------------------------------------------------------------------
INSERT INTO rt (id, nome) VALUES ('00000000-0000-0000-0000-000000020001', 'RT FN-002');

INSERT INTO codigo_escala (id, codigo, descricao, presenca, ocupa_horario, remunerada, cor) VALUES
  ('00000000-0000-0000-0000-000000020002', 'D', 'Disponível', true,  true,  true,  '#111111'),
  ('00000000-0000-0000-0000-000000020003', 'F', 'Folga',      false, false, false, '#222222');

-- ============================================================================
-- PARTE A — sequencial (F2-1..F2-7, F2-9)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- F2-1 / F2-2: âncora 01/08/2026, período 2 (12x36). Ago tem 31 dias (ímpares
-- em relação à âncora, que é dia 1 → 16 linhas). Set tem 30 dias, primeiro
-- dia útil dia 2 (par) → 15 linhas. Mesmo colaborador, dois ciclos.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (
  id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora,
  escala_hora_inicio, escala_hora_fim
) VALUES (
  '00000000-0000-0000-0000-000000020a01', 'MAT2001', 'Fulana FN-002', 'hash2001', '2001',
  '00000000-0000-0000-0000-000000020001', 'DIURNO', '2026-08-01', '07:00', '19:00'
);

INSERT INTO ciclo (id, ano, mes, status, limite_padrao)
  VALUES ('00000000-0000-0000-0000-000000020c01', 2026, 8, 'RASCUNHO', 5);

SELECT is(
  gerar_escala_mensal('00000000-0000-0000-0000-000000020c01'),
  16,
  'F2-1: âncora 01/08, gerar ago → 16 linhas (ímpares)'
);

INSERT INTO ciclo (id, ano, mes, status, limite_padrao)
  VALUES ('00000000-0000-0000-0000-000000020c02', 2026, 9, 'RASCUNHO', 5);

SELECT is(
  gerar_escala_mensal('00000000-0000-0000-0000-000000020c02'),
  15,
  'F2-2: mesma âncora, set → 15 linhas (pares)'
);

-- ----------------------------------------------------------------------------
-- F2-3: fevereiro bissexto (2028, 29 dias). Âncora = 01/02/2028 (dia 1 é
-- dia útil) → ceil(29/2) = 15 linhas em fev; março começa no dia 2 (29 é
-- ímpar, então o dia 1 de março quebra a paridade e o dia 2 retoma).
-- Colaborador dedicado para não interferir na âncora de F2-1/F2-2.
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (
  id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora,
  escala_hora_inicio, escala_hora_fim
) VALUES (
  '00000000-0000-0000-0000-000000020a02', 'MAT2002', 'Beltrana FN-002', 'hash2002', '2002',
  '00000000-0000-0000-0000-000000020001', 'DIURNO', '2028-02-01', '07:00', '19:00'
);

INSERT INTO ciclo (id, ano, mes, status, limite_padrao)
  VALUES ('00000000-0000-0000-0000-000000020c03', 2028, 2, 'RASCUNHO', 5);

SELECT is(
  gerar_escala_mensal('00000000-0000-0000-0000-000000020c03'),
  15,
  'F2-3: fev bissexto → 15 linhas'
);

INSERT INTO ciclo (id, ano, mes, status, limite_padrao)
  VALUES ('00000000-0000-0000-0000-000000020c04', 2028, 3, 'RASCUNHO', 5);

SELECT gerar_escala_mensal('00000000-0000-0000-0000-000000020c04');

SELECT is(
  (SELECT min(data) FROM escala_dia
    WHERE colaborador_id = '00000000-0000-0000-0000-000000020a02'
      AND ciclo_id = '00000000-0000-0000-0000-000000020c04'),
  '2028-03-02'::date,
  'F2-3: março começa em 2'
);

-- ----------------------------------------------------------------------------
-- F2-4 / F2-5: gerar 2× o mesmo ciclo → a segunda chamada cria 0 linhas
-- (ON CONFLICT DO NOTHING, idempotência RN-05). Entre as duas gerações, o
-- admin "lança uma ausência" sobre um dia útil já materializado por F2-1
-- (2026-08-03, um dos 16 dias ímpares) trocando seu código para F via
-- UPDATE — é assim que uma ausência real é lançada em cima da escala base
-- (não por um segundo INSERT, que colidiria com a UNIQUE(colaborador_id,
-- data)). A segunda geração deve continuar criando 0 linhas E preservar o F
-- lançado manualmente (DO NOTHING não sobrescreve).
-- ----------------------------------------------------------------------------
UPDATE escala_dia SET codigo_escala_id = '00000000-0000-0000-0000-000000020003'
 WHERE colaborador_id = '00000000-0000-0000-0000-000000020a01'
   AND ciclo_id = '00000000-0000-0000-0000-000000020c01'
   AND data = '2026-08-03';

SELECT is(
  gerar_escala_mensal('00000000-0000-0000-0000-000000020c01'),
  0,
  'F2-4: gerar o mesmo ciclo 2× → segunda cria 0'
);

SELECT is(
  (SELECT codigo_escala_id FROM escala_dia
    WHERE colaborador_id = '00000000-0000-0000-0000-000000020a01'
      AND ciclo_id = '00000000-0000-0000-0000-000000020c01'
      AND data = '2026-08-03'),
  '00000000-0000-0000-0000-000000020003'::uuid,
  'F2-5: F lançado manualmente é preservado após regerar'
);

-- ----------------------------------------------------------------------------
-- F2-6: troca de escala vigente a partir do dia 15 do ciclo. Âncora antiga
-- 01/09/2026 (dias ímpares 1,3,5,...,13 nos dias 1-14); âncora nova
-- 16/09/2026 (dias pares 16,18,...,30 nos dias 15-30, e dia 15 NÃO é dia
-- útil pela âncora nova — é o que prova que a troca realmente pegou no dia
-- 15, e não só a partir do 16).
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (
  id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora,
  escala_hora_inicio, escala_hora_fim
) VALUES (
  '00000000-0000-0000-0000-000000020a03', 'MAT2003', 'Cicrana FN-002', 'hash2003', '2003',
  '00000000-0000-0000-0000-000000020001', 'DIURNO', '2026-09-01', '07:00', '19:00'
);

INSERT INTO troca_escala (id, colaborador_id, vigencia_inicio, turno, ancora, periodo, motivo)
  VALUES (
    '00000000-0000-0000-0000-000000020t01', '00000000-0000-0000-0000-000000020a03',
    '2026-09-15', 'DIURNO', '2026-09-16', 2, 'Teste F2-6'
  );

INSERT INTO ciclo (id, ano, mes, status, limite_padrao)
  VALUES ('00000000-0000-0000-0000-000000020c05', 2026, 9, 'RASCUNHO', 5);

SELECT gerar_escala_mensal('00000000-0000-0000-0000-000000020c05');

SELECT is(
  (SELECT count(*)::int FROM escala_dia
    WHERE colaborador_id = '00000000-0000-0000-0000-000000020a03'
      AND ciclo_id = '00000000-0000-0000-0000-000000020c05'),
  15,
  'F2-6: 7 dias pela âncora antiga (1-14) + 8 pela nova (15-30) = 15 linhas'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM escala_dia
     WHERE colaborador_id = '00000000-0000-0000-0000-000000020a03'
       AND ciclo_id = '00000000-0000-0000-0000-000000020c05'
       AND data = '2026-09-15'
  ),
  'F2-6: dia 15 NÃO é útil pela âncora nova (prova que a troca pegou exatamente no dia 15, não no 16)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM escala_dia
     WHERE colaborador_id = '00000000-0000-0000-0000-000000020a03'
       AND ciclo_id = '00000000-0000-0000-0000-000000020c05'
       AND data = '2026-09-16'
  ),
  'F2-6: dia 16 é útil pela âncora nova'
);

-- ----------------------------------------------------------------------------
-- F2-7: colaborador sem âncora, pulado sem erro.
-- NÃO EXERCITÁVEL neste schema: `colaborador.escala_ancora` e
-- `turno_padrao` são NOT NULL (migration 20260101000003_tabelas) — não é
-- possível inserir um colaborador "sem âncora" para reproduzir o cenário da
-- spec sem violar a constraint da tabela. Ver _conflitos.md, item 7(c).
-- ----------------------------------------------------------------------------
SELECT skip(
  'F2-7: colaborador.escala_ancora/turno_padrao são NOT NULL no schema real — '
  || 'cenário "sem âncora" da spec não é reprodutível (ver _conflitos.md item 7c)',
  1
);

-- ----------------------------------------------------------------------------
-- F2-9: ciclo fechado → CICLO_FECHADO.
-- ----------------------------------------------------------------------------
INSERT INTO ciclo (id, ano, mes, status, limite_padrao)
  VALUES ('00000000-0000-0000-0000-000000020c06', 2026, 10, 'FECHADO', 5);

SELECT throws_ok(
  $$SELECT gerar_escala_mensal('00000000-0000-0000-0000-000000020c06')$$,
  'CICLO_FECHADO',
  'F2-9: ciclo fechado → CICLO_FECHADO'
);

-- ============================================================================
-- PARTE B — concorrência real via dblink (F2-8)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS dblink;

-- ----------------------------------------------------------------------------
-- F2-8: duas gerações concorrentes do mesmo ciclo → uma insere (16, mesma
-- âncora/período de F2-1), a outra 0, sem duplicata (FOR UPDATE no ciclo
-- serializa — SEC-ACID "I").
-- ----------------------------------------------------------------------------
INSERT INTO colaborador (
  id, matricula, nome, cpf_hash, cpf_ultimos4, rt_id, turno_padrao, escala_ancora,
  escala_hora_inicio, escala_hora_fim
) VALUES (
  '00000000-0000-0000-0000-000000020a04', 'MAT2004', 'Deltrana FN-002', 'hash2004', '2004',
  '00000000-0000-0000-0000-000000020001', 'DIURNO', '2026-08-01', '07:00', '19:00'
);

INSERT INTO ciclo (id, ano, mes, status, limite_padrao)
  VALUES ('00000000-0000-0000-0000-000000020c07', 2027, 8, 'RASCUNHO', 5);

DO $$
DECLARE g int;
BEGIN
  FOR g IN 1..2 LOOP
    PERFORM dblink_connect('f28_' || g, 'dbname=' || current_database());
    PERFORM dblink_send_query('f28_' || g,
      $q$SELECT gerar_escala_mensal('00000000-0000-0000-0000-000000020c07'::uuid)$q$);
  END LOOP;
END $$;

CREATE TEMP TABLE __f28_resultados__ (g int, criados int);
DO $$
DECLARE
  g int;
  v_row record;
BEGIN
  FOR g IN 1..2 LOOP
    SELECT * INTO v_row FROM dblink_get_result('f28_' || g) AS t(criados int);
    INSERT INTO __f28_resultados__ VALUES (g, v_row.criados);
    PERFORM dblink_disconnect('f28_' || g);
  END LOOP;
END $$;

SELECT is(
  (SELECT count(*)::int FROM __f28_resultados__ WHERE criados = 16),
  1,
  'F2-8: exatamente uma das duas chamadas concorrentes cria as 16 linhas'
);

SELECT is(
  (SELECT count(*)::int FROM __f28_resultados__ WHERE criados = 0),
  1,
  'F2-8: a outra chamada cria 0 (idempotência sob concorrência real)'
);

SELECT is(
  (SELECT count(*)::int FROM escala_dia
    WHERE colaborador_id = '00000000-0000-0000-0000-000000020a04'
      AND ciclo_id = '00000000-0000-0000-0000-000000020c07'),
  16,
  'F2-8: sem duplicata — 16 linhas no total, não 32'
);

SELECT * FROM finish();

-- ----------------------------------------------------------------------------
-- Limpeza (autocommit — sem ROLLBACK global neste arquivo, ver nota de
-- arquitetura acima).
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS __f28_resultados__;
DELETE FROM escala_dia WHERE ciclo_id IN (
  SELECT id FROM ciclo WHERE id::text LIKE '00000000-0000-0000-0000-000000020c%'
);
DELETE FROM troca_escala WHERE id::text LIKE '00000000-0000-0000-0000-000000020t%';
DELETE FROM ciclo WHERE id::text LIKE '00000000-0000-0000-0000-000000020c%';
DELETE FROM colaborador WHERE id::text LIKE '00000000-0000-0000-0000-000000020a%';
DELETE FROM codigo_escala WHERE id::text LIKE '00000000-0000-0000-0000-000000020%';
DELETE FROM rt WHERE id::text LIKE '00000000-0000-0000-0000-000000020%';
