-- ============================================================================
-- 005_triggers — DB-003 (specs/03-banco/triggers.md)
-- ============================================================================
-- `specs/AGENTS.md` marca este arquivo como limite rígido — "alteração
-- exige revisão humana" — mas o usuário confirmou explicitamente que este
-- agente (Agente F, Onda 1) pode implementar mesmo assim, sem pausar para
-- gate humano, desde que siga a spec ao pé da letra, sem simplificar nem
-- relaxar nada. Todo o SQL abaixo é transcrição literal de
-- `specs/03-banco/triggers.md`, sem adição nem omissão de cláusula.
--
-- Até esta migration existir, `inicio_em`/`fim_em`/`atualizado_em`
-- recebiam apenas o default de schema (`now()`); a partir daqui recebem o
-- valor calculado/atualizado correto.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- preencher_intervalo — fonte única do cálculo temporal.
--
-- A aplicação nunca escreve inicio_em / fim_em. `hora_fim <= hora_inicio`
-- identifica o turno que cruza a meia-noite (cobre 19→07 e também 19→19,
-- 24h, se algum dia existir).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION preencher_intervalo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.inicio_em := (NEW.data + NEW.hora_inicio::time) AT TIME ZONE 'America/Sao_Paulo';
  NEW.fim_em := CASE
    WHEN NEW.hora_fim::time <= NEW.hora_inicio::time
      THEN (NEW.data + 1 + NEW.hora_fim::time) AT TIME ZONE 'America/Sao_Paulo'
      ELSE (NEW.data + NEW.hora_fim::time) AT TIME ZONE 'America/Sao_Paulo'
  END;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_plantao_intervalo BEFORE INSERT OR UPDATE OF data, hora_inicio, hora_fim
  ON plantao FOR EACH ROW EXECUTE FUNCTION preencher_intervalo();

CREATE TRIGGER trg_escala_intervalo BEFORE INSERT OR UPDATE OF data, hora_inicio, hora_fim
  ON escala_dia FOR EACH ROW EXECUTE FUNCTION preencher_intervalo();

-- ----------------------------------------------------------------------------
-- copiar_intervalo_marcacao — marcacao precisa do intervalo próprio para a
-- exclusion constraint (DB-002).
--
-- Alterar o horário de um plantão exige propagar para as marcações
-- confirmadas na mesma transação — responsabilidade de API-ADM-PLA-003, não
-- deste trigger. Um trigger em plantao que atualizasse marcacao esconderia
-- a operação de quem lê o handler.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION copiar_intervalo_marcacao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT p.inicio_em, p.fim_em INTO NEW.inicio_em, NEW.fim_em
    FROM plantao p WHERE p.id = NEW.plantao_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_marcacao_intervalo BEFORE INSERT OR UPDATE OF plantao_id
  ON marcacao FOR EACH ROW EXECUTE FUNCTION copiar_intervalo_marcacao();

-- ----------------------------------------------------------------------------
-- atualizado_em — aplicado a colaborador, ciclo, escala_dia (exatamente as
-- três tabelas listadas em triggers.md, nem mais, nem menos — ver nota sobre
-- `plantao` em `_conflitos.md`).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tocar_atualizado_em() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.atualizado_em := now(); RETURN NEW; END $$;

CREATE TRIGGER trg_colaborador_atualizado_em BEFORE UPDATE
  ON colaborador FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();

CREATE TRIGGER trg_ciclo_atualizado_em BEFORE UPDATE
  ON ciclo FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();

CREATE TRIGGER trg_escala_dia_atualizado_em BEFORE UPDATE
  ON escala_dia FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();
