-- ============================================================================
-- FN-005 (marcar_extra) e FN-007 (plantoes_para_colaborador) — RN-16
-- estendida (pedido do usuário, ver _conflitos.md).
-- ============================================================================
-- LIMITE RÍGIDO: `marcar_extra` está na lista de `specs/AGENTS.md` que exige
-- revisão humana antes de qualquer alteração de corpo. O usuário descreveu o
-- cenário exato e pediu a implementação nesta conversa — mesma autorização
-- explícita já usada quando FN-004/FN-005 foram implementadas pela primeira
-- vez (ver comentário de 20260101000007_funcoes). `plantoes_para_colaborador`
-- não está na lista de limite rígido, mas seu motivo EM_AUSENCIA precisa
-- continuar batendo exatamente com o que `marcar_extra` lançaria para o
-- mesmo par (plantão, colaborador) — nota já registrada no corpo de FN-007
-- ("os dois pontos de decisão convergem... não reimplementa a regra") — por
-- isso as duas funções mudam juntas, na mesma migration.
--
-- Cenário relatado: colaborador NOTURNO, par (ex.: âncora 02/09/2026), tem o
-- dia 20/09 convertido de 'D' para folga (`API-ADM-ESC-002`, override
-- pontual — não o padrão de rotação, que nunca materializa `escala_dia` para
-- dias de folga regulares). O turno NOTURNO de 19/09 (19:00 → 20/09 07:00)
-- "termina" dentro da madrugada de 20/09 — mas como `escala_dia` do dia
-- 20/09 (o de folga) guarda o intervalo 20/09 19:00 → 21/09 07:00 (mesma
-- hora_inicio/hora_fim que a linha tinha quando ainda era 'D', preservada
-- pela troca de código — API-ADM-ESC-002 só troca `codigo_escala_id`, nunca
-- hora_inicio/hora_fim), os dois intervalos não se sobrepõem literalmente:
-- `valida_descanso` (FN-004, passo 8/4) não acusa nada, e o passo 7 antigo
-- (`ausência no dia`) só olhava `escala_dia.data = plantao.data`, que também
-- não bate (plantão é do dia 19, a folga está registrada no dia 20).
--
-- Regra de negócio pedida (RN-16 estendida): uma extra NOTURNA cujo turno
-- cruza a meia-noite (19:00 → D+1 07:00) fica bloqueada se D OU D+1 tiver
-- ausência registrada (folga/férias/etc., qualquer código ≠ 'D') — os dias
-- de folga/férias em qualquer ponta do turno ficam protegidos, não só o dia
-- nominal do plantão. Extra DIURNA (07:00 → 19:00, nunca cruza meia-noite)
-- continua checando só o próprio dia — nenhuma mudança de comportamento
-- para DIURNO.
--
-- Implementação: `e.data IN (v_plantao.data, CASE WHEN v_plantao.tipo =
-- 'NOTURNO' THEN v_plantao.data + 1 END)` — quando o turno é DIURNO a
-- segunda posição do IN é NULL e nunca casa com nada (equivalente, em
-- comportamento, à checagem antiga de um único dia); quando é NOTURNO, o dia
-- seguinte entra na varredura. `EXISTS` em vez de `SELECT INTO` porque agora
-- pode haver até duas linhas candidatas (uma por dia) — só precisamos saber
-- se PELO MENOS UMA é ausência, não qual delas.
--
-- Nenhum outro passo de nenhuma das duas funções foi alterado — corpo
-- transcrito integralmente de 20260101000007_funcoes, só o passo 7 de
-- marcar_extra e o passo 3 de plantoes_para_colaborador mudam.
-- ============================================================================

CREATE OR REPLACE FUNCTION marcar_extra(
  p_plantao_id uuid, p_colaborador_id uuid,
  p_origem origem_marcacao DEFAULT 'COLABORADOR',
  p_ip text DEFAULT NULL, p_user_agent text DEFAULT NULL
) RETURNS marcacao LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_plantao plantao%ROWTYPE; v_colab colaborador%ROWTYPE; v_ciclo ciclo%ROWTYPE;
  v_part participacao_ciclo%ROWTYPE;
  v_erro text; v_limite int; v_usadas int; v_cruzada boolean; v_result marcacao%ROWTYPE;
BEGIN
  -- 1. advisory lock do colaborador — SEMPRE primeiro (SEC-ACID).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_colaborador_id::text, 0));

  -- 2. plantao FOR UPDATE.
  SELECT * INTO v_plantao FROM plantao WHERE id = p_plantao_id FOR UPDATE;
  IF NOT FOUND OR NOT v_plantao.ativo THEN RAISE EXCEPTION 'PLANTAO_INDISPONIVEL'; END IF;

  -- 3. ciclo: existe, PUBLICADO, dentro da janela (janela ignorada para ADMIN — RN-27).
  SELECT * INTO v_ciclo FROM ciclo WHERE id = v_plantao.ciclo_id;
  IF v_ciclo.status <> 'PUBLICADO' THEN RAISE EXCEPTION 'CICLO_FECHADO'; END IF;
  IF p_origem = 'COLABORADOR' THEN
    IF v_ciclo.abertura_marcacao IS NOT NULL AND now() < v_ciclo.abertura_marcacao
       THEN RAISE EXCEPTION 'JANELA_NAO_ABERTA'; END IF;
    IF v_ciclo.fechamento_marcacao IS NOT NULL AND now() > v_ciclo.fechamento_marcacao
       THEN RAISE EXCEPTION 'JANELA_ENCERRADA'; END IF;
  END IF;

  -- 4. colaborador ativo.
  SELECT * INTO v_colab FROM colaborador WHERE id = p_colaborador_id AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'COLABORADOR_INATIVO'; END IF;

  -- 5. participacao: não bloqueado.
  SELECT * INTO v_part FROM participacao_ciclo
   WHERE ciclo_id = v_ciclo.id AND colaborador_id = p_colaborador_id;
  IF COALESCE(v_part.bloqueado, false) THEN RAISE EXCEPTION 'COLABORADOR_BLOQUEADO'; END IF;

  -- 6. RT cruzada.
  v_cruzada := v_plantao.rt_id <> v_colab.rt_id;
  IF v_cruzada AND NOT COALESCE(
       v_part.permite_cruzada, v_plantao.permite_cruzada, v_ciclo.permite_cruzada, false)
     THEN RAISE EXCEPTION 'CRUZADA_BLOQUEADA'; END IF;

  -- 7. ausência no dia OU no dia seguinte quando o plantão é NOTURNO (cruza
  -- meia-noite) — RN-16 estendida, ver cabeçalho desta migration.
  IF EXISTS (
    SELECT 1
      FROM escala_dia e JOIN codigo_escala ce ON ce.id = e.codigo_escala_id
     WHERE e.colaborador_id = p_colaborador_id
       AND e.data IN (v_plantao.data, CASE WHEN v_plantao.tipo = 'NOTURNO' THEN v_plantao.data + 1 END)
       AND ce.codigo <> 'D'
  ) AND NOT v_ciclo.permite_extra_em_folga
     THEN RAISE EXCEPTION 'EM_AUSENCIA'; END IF;

  -- 8. valida_descanso (FN-004).
  v_erro := valida_descanso(p_colaborador_id, v_plantao.inicio_em, v_plantao.fim_em,
                            v_ciclo.max_blocos_seguidos);
  IF v_erro IS NOT NULL THEN RAISE EXCEPTION '%', v_erro; END IF;

  -- 9. limite do ciclo.
  v_limite := COALESCE(v_part.limite_override, v_ciclo.limite_padrao);
  SELECT count(*) INTO v_usadas
    FROM marcacao m JOIN plantao p ON p.id = m.plantao_id
   WHERE m.colaborador_id = p_colaborador_id AND m.status = 'CONFIRMADA'
     AND p.ciclo_id = v_ciclo.id;
  IF v_usadas >= v_limite THEN RAISE EXCEPTION 'LIMITE_ATINGIDO'; END IF;

  -- 10. vagas.
  IF v_plantao.vagas_ocupadas >= v_plantao.vagas_totais THEN RAISE EXCEPTION 'SEM_VAGA'; END IF;

  -- 11. INSERT + UPDATE contador, mesma transação (ACID — A). Sem ip/user_agent
  -- (marcacao não tem essas colunas — ver 20260101000007_funcoes).
  INSERT INTO marcacao (id, plantao_id, colaborador_id, status, cruzada, origem)
  VALUES (gen_random_uuid(), p_plantao_id, p_colaborador_id, 'CONFIRMADA', v_cruzada, p_origem)
  RETURNING * INTO v_result;

  UPDATE plantao SET vagas_ocupadas = vagas_ocupadas + 1 WHERE id = p_plantao_id;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION plantoes_para_colaborador(
  p_ciclo_id uuid, p_colaborador_id uuid
) RETURNS TABLE (
  plantao_id uuid, data date, tipo turno, rt_codigo text,
  hora_inicio text, hora_fim text,
  vagas_totais int, vagas_ocupadas int,
  ja_marcado boolean, disponivel boolean, motivo text
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_colab   colaborador%ROWTYPE;
  v_ciclo   ciclo%ROWTYPE;
  v_part    participacao_ciclo%ROWTYPE;
  v_limite  int;
  v_usadas  int;
  v_limite_atingido boolean;
  v_p       record;
  v_cruzada boolean;
  v_erro    text;
  v_motivo  text;
BEGIN
  SELECT * INTO v_colab FROM colaborador WHERE id = p_colaborador_id;
  SELECT * INTO v_ciclo FROM ciclo WHERE id = p_ciclo_id;
  SELECT * INTO v_part FROM participacao_ciclo
   WHERE ciclo_id = p_ciclo_id AND colaborador_id = p_colaborador_id;

  -- LIMITE_ATINGIDO: calculado uma vez, fora do laço (nota da spec).
  v_limite := COALESCE(v_part.limite_override, v_ciclo.limite_padrao);
  SELECT count(*) INTO v_usadas
    FROM marcacao m JOIN plantao p ON p.id = m.plantao_id
   WHERE m.colaborador_id = p_colaborador_id AND m.status = 'CONFIRMADA'
     AND p.ciclo_id = p_ciclo_id;
  v_limite_atingido := v_usadas >= v_limite;

  FOR v_p IN
    SELECT p.id, p.data, p.tipo, p.rt_id, p.hora_inicio, p.hora_fim,
           p.inicio_em, p.fim_em, p.vagas_totais, p.vagas_ocupadas,
           p.permite_cruzada, rt.nome AS rt_nome
      FROM plantao p JOIN rt ON rt.id = p.rt_id
     WHERE p.ciclo_id = p_ciclo_id AND p.ativo
     ORDER BY p.data, p.hora_inicio
  LOOP
    v_motivo := NULL;

    -- 1. JA_MARCADO — vence todos os outros motivos (a UI já mostra a
    -- marcação existente; não faz sentido também dizer "bloqueado").
    IF EXISTS (
      SELECT 1 FROM marcacao m
       WHERE m.plantao_id = v_p.id AND m.colaborador_id = p_colaborador_id
         AND m.status = 'CONFIRMADA'
    ) THEN
      plantao_id := v_p.id; data := v_p.data; tipo := v_p.tipo;
      rt_codigo := v_p.rt_nome;
      hora_inicio := v_p.hora_inicio::text; hora_fim := v_p.hora_fim::text;
      vagas_totais := v_p.vagas_totais; vagas_ocupadas := v_p.vagas_ocupadas;
      ja_marcado := true; disponivel := false; motivo := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- 2. CRUZADA_BLOQUEADA (mesma precedência de marcar_extra passo 6:
    -- participacao_ciclo → plantao → ciclo → false, RN-20).
    v_cruzada := v_p.rt_id <> v_colab.rt_id;
    IF v_cruzada AND NOT COALESCE(
         v_part.permite_cruzada, v_p.permite_cruzada, v_ciclo.permite_cruzada, false)
    THEN
      v_motivo := 'CRUZADA_BLOQUEADA';
    END IF;

    -- 3. EM_AUSENCIA (mesmo critério do passo 7 de marcar_extra, agora
    -- também olhando o dia seguinte quando o turno é NOTURNO — ver
    -- cabeçalho desta migration. Não pode divergir do passo 7 de
    -- marcar_extra).
    IF v_motivo IS NULL THEN
      IF EXISTS (
        SELECT 1
          FROM escala_dia e JOIN codigo_escala ce ON ce.id = e.codigo_escala_id
         WHERE e.colaborador_id = p_colaborador_id
           AND e.data IN (v_p.data, CASE WHEN v_p.tipo = 'NOTURNO' THEN v_p.data + 1 END)
           AND ce.codigo <> 'D'
      ) AND NOT v_ciclo.permite_extra_em_folga THEN
        v_motivo := 'EM_AUSENCIA';
      END IF;
    END IF;

    -- 4/5. CONFLITO_DE_HORARIO / EXCEDE_JORNADA — mesma chamada a
    -- valida_descanso (FN-004) que marcar_extra usa no passo 8 (F7-8: motivo
    -- aqui e erro de FN-005 nascem da mesma função, não podem divergir).
    IF v_motivo IS NULL THEN
      v_erro := valida_descanso(p_colaborador_id, v_p.inicio_em, v_p.fim_em,
                                v_ciclo.max_blocos_seguidos);
      IF v_erro IS NOT NULL THEN v_motivo := v_erro; END IF;
    END IF;

    -- 6. LIMITE_ATINGIDO — valor pré-calculado fora do laço.
    IF v_motivo IS NULL AND v_limite_atingido THEN
      v_motivo := 'LIMITE_ATINGIDO';
    END IF;

    -- 7. SEM_VAGA — por último de propósito (nota da spec: "estaria
    -- liberado, mas lotou" é mais útil do que a célula sumir).
    IF v_motivo IS NULL AND v_p.vagas_ocupadas >= v_p.vagas_totais THEN
      v_motivo := 'SEM_VAGA';
    END IF;

    plantao_id := v_p.id; data := v_p.data; tipo := v_p.tipo;
    rt_codigo := v_p.rt_nome;
    hora_inicio := v_p.hora_inicio::text; hora_fim := v_p.hora_fim::text;
    vagas_totais := v_p.vagas_totais; vagas_ocupadas := v_p.vagas_ocupadas;
    ja_marcado := false; disponivel := (v_motivo IS NULL); motivo := v_motivo;
    RETURN NEXT;
  END LOOP;

  RETURN;
END $$;
