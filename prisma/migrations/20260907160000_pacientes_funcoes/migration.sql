-- ============================================================================
-- pacientes_funcoes — specs/03-banco/funcoes/fn-010..016-*.md
-- ============================================================================
-- FN-010 criar_agendamento, FN-011 cancelar_agendamento, FN-012
-- separar_medicamento, FN-013 agenda_rt, FN-014 alertas_medicamento, FN-015
-- conferir_medicamento, FN-016 administrar_medicamento.
--
-- FN-012, FN-015 e FN-016 são limite rígido (specs/AGENTS.md — alteração
-- exige revisão humana): é onde a checagem dupla (RNP-25..27) é decidida.
-- Corpo abaixo é transcrição literal das specs correspondentes.
--
-- SECURITY DEFINER + search_path fixo nas funções transacionais (mesmo
-- padrão de marcar_extra/cancelar_extra — SEC-RLS); GRANT EXECUTE só para
-- app_server acontece em pacientes_rls (grants depois das funções,
-- 03-banco/migrations.md).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FN-010 — criar_agendamento (specs/03-banco/funcoes/fn-010-criar-agendamento.md)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION criar_agendamento(
  p_paciente_id uuid, p_tipo tipo_agendamento, p_titulo text, p_local text,
  p_inicio_em timestamptz, p_fim_em timestamptz,
  p_acompanhante_colaborador_id uuid DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_origem origem_agendamento DEFAULT 'COLABORADOR',
  p_criado_por_colaborador_id uuid DEFAULT NULL,
  p_criado_por_admin_id uuid DEFAULT NULL
) RETURNS agendamento LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_paciente paciente%ROWTYPE; v_result agendamento%ROWTYPE;
BEGIN
  SELECT * INTO v_paciente FROM paciente WHERE id = p_paciente_id FOR UPDATE;
  IF NOT FOUND OR v_paciente.status <> 'ATIVO' THEN
    RAISE EXCEPTION 'PACIENTE_INDISPONIVEL';
  END IF;

  IF p_inicio_em >= p_fim_em THEN RAISE EXCEPTION 'INTERVALO_INVALIDO'; END IF;

  IF p_origem = 'COLABORADOR' AND p_inicio_em < now() THEN
    RAISE EXCEPTION 'AGENDAMENTO_RETROATIVO';
  END IF;

  INSERT INTO agendamento (
    id, paciente_id, rt_id, tipo, titulo, local, inicio_em, fim_em,
    acompanhante_colaborador_id, origem, criado_por_colaborador_id, criado_por_admin_id,
    status, observacoes
  ) VALUES (
    gen_random_uuid(), p_paciente_id, v_paciente.rt_id, p_tipo, p_titulo, p_local,
    p_inicio_em, p_fim_em, p_acompanhante_colaborador_id, p_origem,
    p_criado_por_colaborador_id, p_criado_por_admin_id, 'AGENDADO', p_observacoes
  ) RETURNING * INTO v_result;

  RETURN v_result;
END $$;

-- ----------------------------------------------------------------------------
-- FN-011 — cancelar_agendamento (specs/03-banco/funcoes/fn-011-cancelar-agendamento.md)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cancelar_agendamento(
  p_agendamento_id uuid, p_motivo text,
  p_ator_colaborador_id uuid DEFAULT NULL, p_ator_admin_id uuid DEFAULT NULL
) RETURNS agendamento LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ag agendamento%ROWTYPE; v_result agendamento%ROWTYPE;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO';
  END IF;

  SELECT * INTO v_ag FROM agendamento WHERE id = p_agendamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDAMENTO_INEXISTENTE'; END IF;

  IF v_ag.status IN ('CANCELADO', 'REALIZADO', 'NAO_COMPARECEU') THEN
    RAISE EXCEPTION 'AGENDAMENTO_JA_ENCERRADO';
  END IF;

  UPDATE agendamento
     SET status = 'CANCELADO', motivo_cancelamento = p_motivo, cancelado_em = now()
   WHERE id = p_agendamento_id
  RETURNING * INTO v_result;

  RETURN v_result;
END $$;

-- ----------------------------------------------------------------------------
-- FN-012 — separar_medicamento (specs/03-banco/funcoes/fn-012-separar-medicamento.md)
-- 🔒 limite rígido — checagem dupla, etapa 1.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION separar_medicamento(
  p_prescricao_id uuid, p_colaborador_id uuid,
  p_horario_previsto timestamptz DEFAULT NULL,
  p_administracao_id uuid DEFAULT NULL
) RETURNS administracao_medicamento
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_presc prescricao%ROWTYPE; v_adm administracao_medicamento%ROWTYPE;
  v_result administracao_medicamento%ROWTYPE;
BEGIN
  SELECT * INTO v_presc FROM prescricao WHERE id = p_prescricao_id FOR UPDATE;
  IF NOT FOUND OR v_presc.status <> 'ATIVA' THEN RAISE EXCEPTION 'PRESCRICAO_INATIVA'; END IF;

  IF now()::date < v_presc.data_inicio
     OR (v_presc.data_fim IS NOT NULL AND now()::date > v_presc.data_fim) THEN
    RAISE EXCEPTION 'FORA_DA_VIGENCIA';
  END IF;

  IF v_presc.tipo = 'REGULAR' THEN
    IF p_horario_previsto IS NULL THEN RAISE EXCEPTION 'HORARIO_PREVISTO_OBRIGATORIO'; END IF;
    SELECT * INTO v_adm FROM administracao_medicamento
     WHERE prescricao_id = p_prescricao_id AND horario_previsto = p_horario_previsto
       AND status <> 'DIVERGENTE'
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DOSE_NAO_PREVISTA'; END IF;
    IF v_adm.status <> 'PENDENTE' THEN RAISE EXCEPTION 'DOSE_JA_SEPARADA'; END IF;

    UPDATE administracao_medicamento
       SET status = 'SEPARADO', separado_por_id = p_colaborador_id, separado_em = now()
     WHERE id = v_adm.id
    RETURNING * INTO v_result;
  ELSE
    IF p_horario_previsto IS NOT NULL THEN
      RAISE EXCEPTION 'PRESCRICAO_PRN_SEM_HORARIO';
    END IF;
    INSERT INTO administracao_medicamento (
      id, prescricao_id, horario_previsto, status, separado_por_id, separado_em
    ) VALUES (
      gen_random_uuid(), p_prescricao_id, NULL, 'SEPARADO', p_colaborador_id, now()
    ) RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END $$;

-- ----------------------------------------------------------------------------
-- FN-013 — agenda_rt (specs/03-banco/funcoes/fn-013-agenda-rt.md)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION agenda_rt(p_rt_id uuid, p_de date, p_ate date)
RETURNS TABLE (
  agendamento_id uuid, paciente_id uuid, paciente_nome text, tipo tipo_agendamento,
  titulo text, local text, inicio_em timestamptz, fim_em timestamptz,
  status status_agendamento, acompanhante_nome text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT a.id, a.paciente_id, p.nome, a.tipo, a.titulo, a.local,
         a.inicio_em, a.fim_em, a.status, c.nome
    FROM agendamento a
    JOIN paciente p ON p.id = a.paciente_id
    LEFT JOIN colaborador c ON c.id = a.acompanhante_colaborador_id
   WHERE a.rt_id = p_rt_id
     AND a.inicio_em < (p_ate + 1)::timestamptz
     AND a.fim_em >= p_de::timestamptz
   ORDER BY a.inicio_em;
$$;

-- ----------------------------------------------------------------------------
-- FN-014 — alertas_medicamento (specs/03-banco/funcoes/fn-014-alertas-medicamento.md)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION alertas_medicamento(p_rt_id uuid, p_tolerancia_minutos int DEFAULT 30)
RETURNS TABLE (
  administracao_id uuid, prescricao_id uuid, paciente_id uuid, paciente_nome text,
  medicamento_nome text, horario_previsto timestamptz, etapa_parada status_administracao,
  minutos_atraso int
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT am.id, pr.id, pa.id, pa.nome, m.nome, am.horario_previsto, am.status,
         floor(extract(epoch FROM (
           now() - COALESCE(am.separado_em, am.horario_previsto)
         )) / 60)::int
    FROM administracao_medicamento am
    JOIN prescricao pr ON pr.id = am.prescricao_id
    JOIN paciente pa ON pa.id = pr.paciente_id
    JOIN medicamento m ON m.id = pr.medicamento_id
   WHERE pa.rt_id = p_rt_id
     AND am.status IN ('PENDENTE', 'SEPARADO')
     AND pr.status = 'ATIVA'
     AND COALESCE(am.separado_em, am.horario_previsto)
         < now() - make_interval(mins => p_tolerancia_minutos)
   ORDER BY am.horario_previsto NULLS LAST, am.separado_em;
$$;

-- ----------------------------------------------------------------------------
-- FN-015 — conferir_medicamento (specs/03-banco/funcoes/fn-015-conferir-medicamento.md)
-- 🔒 limite rígido — checagem dupla, etapa 2.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION conferir_medicamento(
  p_administracao_id uuid, p_colaborador_id uuid,
  p_confere boolean, p_observacao text DEFAULT NULL
) RETURNS administracao_medicamento
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_adm administracao_medicamento%ROWTYPE; v_result administracao_medicamento%ROWTYPE;
BEGIN
  SELECT * INTO v_adm FROM administracao_medicamento WHERE id = p_administracao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMINISTRACAO_INEXISTENTE'; END IF;
  IF v_adm.status <> 'SEPARADO' THEN RAISE EXCEPTION 'DOSE_NAO_SEPARADA'; END IF;

  IF p_colaborador_id = v_adm.separado_por_id THEN
    RAISE EXCEPTION 'CONFERENTE_IGUAL_SEPARADOR';
  END IF;

  IF NOT p_confere THEN
    IF p_observacao IS NULL OR btrim(p_observacao) = '' THEN
      RAISE EXCEPTION 'JUSTIFICATIVA_OBRIGATORIA';
    END IF;
    UPDATE administracao_medicamento
       SET status = 'DIVERGENTE', conferido_por_id = p_colaborador_id, conferido_em = now(),
           observacao = p_observacao
     WHERE id = p_administracao_id
    RETURNING * INTO v_result;
  ELSE
    UPDATE administracao_medicamento
       SET status = 'CONFERIDO', conferido_por_id = p_colaborador_id, conferido_em = now(),
           observacao = p_observacao
     WHERE id = p_administracao_id
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END $$;

-- ----------------------------------------------------------------------------
-- FN-016 — administrar_medicamento (specs/03-banco/funcoes/fn-016-administrar-medicamento.md)
-- 🔒 limite rígido — checagem dupla, etapa 3.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION administrar_medicamento(
  p_administracao_id uuid, p_colaborador_id uuid,
  p_status status_administracao, p_observacao text DEFAULT NULL
) RETURNS administracao_medicamento
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_adm administracao_medicamento%ROWTYPE; v_result administracao_medicamento%ROWTYPE;
BEGIN
  SELECT * INTO v_adm FROM administracao_medicamento WHERE id = p_administracao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMINISTRACAO_INEXISTENTE'; END IF;
  IF v_adm.status <> 'CONFERIDO' THEN RAISE EXCEPTION 'DOSE_NAO_CONFERIDA'; END IF;

  IF p_colaborador_id NOT IN (v_adm.separado_por_id, v_adm.conferido_por_id) THEN
    RAISE EXCEPTION 'ADMINISTRADOR_NAO_PARTICIPOU';
  END IF;

  IF p_status = 'RECUSADO' AND (p_observacao IS NULL OR btrim(p_observacao) = '') THEN
    RAISE EXCEPTION 'JUSTIFICATIVA_OBRIGATORIA';
  END IF;

  UPDATE administracao_medicamento
     SET status = p_status, administrado_por_id = p_colaborador_id, administrado_em = now(),
         observacao = COALESCE(p_observacao, observacao)
   WHERE id = p_administracao_id
  RETURNING * INTO v_result;

  RETURN v_result;
END $$;
