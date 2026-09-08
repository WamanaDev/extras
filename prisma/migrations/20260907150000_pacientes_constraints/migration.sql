-- ============================================================================
-- pacientes_constraints — DB-007 (specs/03-banco/constraints-pacientes.md)
-- ============================================================================
-- specs/AGENTS.md marca este arquivo como limite rígido ("alteração exige
-- revisão humana"), mesmo tratamento dado a 004_constraints — o usuário
-- comissionou este módulo completo nesta branch (`pacientes`), então o corpo
-- abaixo é transcrição literal de specs/03-banco/constraints-pacientes.md,
-- sem adição nem omissão de cláusula. Os dois CHECK de checagem dupla
-- (`chk_separador_conferente_distintos`, `chk_administrador_participou`) são
-- a última linha de defesa de segurança do paciente, não só integridade de
-- dado — ver racional completo na spec.
--
-- Pré-requisito: `btree_gist` já habilitada em 001_extensoes.
--
-- Fonte: specs/03-banco/constraints-pacientes.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Únicas
-- ----------------------------------------------------------------------------

-- Uma administração ativa por (prescrição, horário previsto). DIVERGENTE sai
-- da unicidade para permitir nova separação no mesmo horário (RNP-28).
CREATE UNIQUE INDEX administracao_unica_prevista
  ON administracao_medicamento (prescricao_id, horario_previsto)
  WHERE horario_previsto IS NOT NULL AND status <> 'DIVERGENTE';

-- ----------------------------------------------------------------------------
-- Checks
-- ----------------------------------------------------------------------------

ALTER TABLE agendamento
  ADD CONSTRAINT chk_agendamento_intervalo CHECK (inicio_em < fim_em);

ALTER TABLE prescricao
  ADD CONSTRAINT chk_prescricao_vigencia CHECK (data_fim IS NULL OR data_inicio <= data_fim),
  ADD CONSTRAINT chk_prescricao_horarios CHECK (
    (tipo = 'PRN' AND horarios = '{}') OR (tipo = 'REGULAR' AND cardinality(horarios) > 0)
  ),
  -- RNP-24: duração define se data_fim é obrigatório ou proibido.
  ADD CONSTRAINT chk_prescricao_duracao CHECK (
    (duracao = 'TEMPORARIA' AND data_fim IS NOT NULL) OR
    (duracao = 'DEFINITIVA' AND data_fim IS NULL)
  );

ALTER TABLE administracao_medicamento
  ADD CONSTRAINT chk_administracao_observacao CHECK (
    status NOT IN ('RECUSADO', 'DIVERGENTE') OR observacao IS NOT NULL
  ),
  -- RNP-26: quem confere não pode ser quem separou a mesma dose.
  ADD CONSTRAINT chk_separador_conferente_distintos CHECK (
    separado_por_id IS NULL OR conferido_por_id IS NULL OR separado_por_id <> conferido_por_id
  ),
  -- RNP-27: quem administra é o separador ou o conferente — nunca um terceiro.
  ADD CONSTRAINT chk_administrador_participou CHECK (
    administrado_por_id IS NULL
    OR administrado_por_id = separado_por_id
    OR administrado_por_id = conferido_por_id
  ),
  -- Ordem das etapas: não existe conferência sem separação, nem administração sem conferência.
  ADD CONSTRAINT chk_ordem_etapas CHECK (
    (conferido_por_id IS NULL OR separado_por_id IS NOT NULL) AND
    (administrado_por_id IS NULL OR conferido_por_id IS NOT NULL)
  );

-- ----------------------------------------------------------------------------
-- Exclusion (sobreposição de intervalos) — RNP-07
-- ----------------------------------------------------------------------------

ALTER TABLE agendamento ADD CONSTRAINT excl_agendamento_sobreposto
  EXCLUDE USING gist (paciente_id WITH =, tstzrange(inicio_em, fim_em, '[)') WITH &&)
  WHERE (status NOT IN ('CANCELADO', 'NAO_COMPARECEU'));
