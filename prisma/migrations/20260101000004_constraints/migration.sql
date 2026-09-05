-- ============================================================================
-- 004_constraints — DB-002 (specs/03-banco/constraints.md)
-- ============================================================================
-- Onda 0 (segurança) já havia implementado as duas exclusion constraints em
-- `20260101000004_sec_acid_exclusion_constraints`; preservadas abaixo sem
-- alteração de corpo, só reordenadas para a posição canônica.
--
-- Agente F (Onda 1) completa aqui o restante de `03-banco/constraints.md`:
-- as UNIQUE de negócio e os CHECK, todos copiados literalmente da spec.
-- `specs/AGENTS.md` marca este arquivo como limite rígido — "alteração
-- exige revisão humana" — mas o usuário confirmou explicitamente que este
-- agente pode implementar mesmo assim, sem pausar para gate humano, desde
-- que siga a spec ao pé da letra, sem simplificar nem relaxar nada. Todo o
-- SQL abaixo é transcrição literal de `specs/03-banco/constraints.md`,
-- sem adição nem omissão de cláusula.
--
-- Pré-requisito: CREATE EXTENSION btree_gist — ver 001_extensoes.
--
-- Limitação conhecida e aceita pela spec (não é bug desta migration):
-- exclusion constraint não cruza tabelas. Sobreposição *entre* escala_dia e
-- marcacao continua sendo verificada em FN-004, sob advisory lock — ver
-- src/server/db/tx.ts (travarColaborador).
--
-- Fonte: specs/02-seguranca/acid.md — seção "C — Consistência".
-- Conteúdo original: Onda 0 (segurança),
-- `20260101000004_sec_acid_exclusion_constraints`.
-- ============================================================================

ALTER TABLE escala_dia ADD CONSTRAINT excl_escala_sobreposta
  EXCLUDE USING gist (
    colaborador_id WITH =,
    tstzrange(inicio_em, fim_em, '[)') WITH &&
  );

-- Forma final (desnormalizada) — NÃO a forma com subquery, que a própria spec
-- descarta explicitamente por não ser suportada pelo Postgres.
ALTER TABLE marcacao ADD CONSTRAINT excl_marcacao_sobreposta
  EXCLUDE USING gist (
    colaborador_id WITH =,
    tstzrange(inicio_em, fim_em, '[)') WITH &&
  ) WHERE (status = 'CONFIRMADA');

-- ----------------------------------------------------------------------------
-- Únicas — transcrição literal de constraints.md, seção "Únicas".
-- ----------------------------------------------------------------------------

-- Uma marcação confirmada por (plantão, colaborador). Cancelada não bloqueia remarcar.
CREATE UNIQUE INDEX marcacao_unica_confirmada
  ON marcacao (plantao_id, colaborador_id) WHERE status = 'CONFIRMADA';

CREATE UNIQUE INDEX escala_dia_unica ON escala_dia (colaborador_id, data);
CREATE UNIQUE INDEX plantao_unico ON plantao (ciclo_id, rt_id, data, tipo);
CREATE UNIQUE INDEX ciclo_unico ON ciclo (ano, mes);
CREATE UNIQUE INDEX participacao_unica ON participacao_ciclo (ciclo_id, colaborador_id);
CREATE UNIQUE INDEX colaborador_matricula ON colaborador (matricula);
CREATE UNIQUE INDEX sessao_token ON sessao_colaborador (token_hash);

-- ----------------------------------------------------------------------------
-- Checks — transcrição literal de constraints.md, seção "Checks".
-- ----------------------------------------------------------------------------

ALTER TABLE plantao
  ADD CONSTRAINT chk_vagas CHECK (vagas_ocupadas BETWEEN 0 AND vagas_totais),
  ADD CONSTRAINT chk_vagas_totais CHECK (vagas_totais > 0),
  ADD CONSTRAINT chk_intervalo CHECK (inicio_em < fim_em),
  ADD CONSTRAINT chk_carga CHECK (carga_horas BETWEEN 1 AND 24);

ALTER TABLE ciclo
  ADD CONSTRAINT chk_mes CHECK (mes BETWEEN 1 AND 12),
  ADD CONSTRAINT chk_ano CHECK (ano BETWEEN 2020 AND 2100),
  ADD CONSTRAINT chk_limite CHECK (limite_padrao >= 0),
  ADD CONSTRAINT chk_blocos CHECK (max_blocos_seguidos BETWEEN 1 AND 3),
  ADD CONSTRAINT chk_janela CHECK (
    abertura_marcacao IS NULL OR fechamento_marcacao IS NULL
    OR abertura_marcacao < fechamento_marcacao
  );

ALTER TABLE escala_dia
  ADD CONSTRAINT chk_intervalo_escala CHECK (inicio_em < fim_em);

ALTER TABLE colaborador
  ADD CONSTRAINT chk_periodo CHECK (escala_periodo BETWEEN 1 AND 7),
  ADD CONSTRAINT chk_ultimos4 CHECK (cpf_ultimos4 ~ '^[0-9]{4}$');

ALTER TABLE participacao_ciclo
  ADD CONSTRAINT chk_limite_override CHECK (limite_override IS NULL OR limite_override >= 0);

ALTER TABLE troca_escala
  ADD CONSTRAINT chk_periodo_troca CHECK (periodo BETWEEN 1 AND 7);
