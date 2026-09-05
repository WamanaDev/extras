-- Corrige FN-002 (gerar_escala_mensal, ver 20260101000007_funcoes) — achado
-- só ao gerar escala de verdade pela primeira vez contra Postgres real
-- (nenhum pgTAP tinha rodado antes disso, mesma causa raiz dos itens 28/30
-- de _conflitos.md: divergência que só aparece com banco de verdade).
--
-- `colaborador.escala_hora_inicio`/`escala_hora_fim` são opcionais
-- (`DateTime?` no schema) — servem só de OVERRIDE para quem foge do padrão
-- do próprio turno. A função original inseria esses valores direto, sem
-- fallback: colaborador sem override (o caso comum, cadastro via
-- `POST /api/admin/colaboradores` nunca pede essas horas) gerava
-- `hora_inicio`/`hora_fim` NULL, e o trigger `preencher_intervalo`
-- (`NEW.data + NULL::time` = NULL) produzia `inicio_em`/`fim_em` NULL —
-- violação da constraint NOT NULL dessas duas colunas (`23502`).
--
-- Horários padrão por turno vêm de `01-dominio/blocos-jornada.md`
-- ("DIURNO em D: 07:00 → 19:00", "NOTURNO em D: 19:00 → D+1 07:00"), os
-- mesmos já usados por `src/lib/escala/blocos.ts` do lado TypeScript.
-- `COALESCE(c.escala_hora_inicio, CASE ...)` aplica o override quando
-- existe, e o padrão do turno quando não existe — sem mudar nenhuma outra
-- regra da função (idempotência via ON CONFLICT, filtro de paridade por
-- âncora, etc., todos preservados ao pé da letra).
CREATE OR REPLACE FUNCTION gerar_escala_mensal(
  p_ciclo_id uuid, p_ano int DEFAULT NULL, p_mes int DEFAULT NULL
) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  v_ciclo ciclo%ROWTYPE; v_inicio date; v_fim date; v_criados int := 0;
  v_codigo_d_id uuid;
BEGIN
  SELECT * INTO v_ciclo FROM ciclo WHERE id = p_ciclo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CICLO_INEXISTENTE'; END IF;
  IF v_ciclo.status = 'FECHADO' THEN RAISE EXCEPTION 'CICLO_FECHADO'; END IF;

  SELECT id INTO v_codigo_d_id FROM codigo_escala WHERE codigo = 'D' AND ativo LIMIT 1;

  v_inicio := make_date(v_ciclo.ano, v_ciclo.mes, 1);
  v_fim := (v_inicio + interval '1 month - 1 day')::date;

  INSERT INTO escala_dia
    (id, ciclo_id, colaborador_id, data, codigo_escala_id, hora_inicio, hora_fim, inicio_em, fim_em)
  SELECT gen_random_uuid(), p_ciclo_id, c.id, d::date,
         v_codigo_d_id,
         COALESCE(c.escala_hora_inicio, CASE WHEN c.turno_padrao = 'DIURNO' THEN '07:00'::time ELSE '19:00'::time END),
         COALESCE(c.escala_hora_fim,    CASE WHEN c.turno_padrao = 'DIURNO' THEN '19:00'::time ELSE '07:00'::time END),
         now(), now()                                   -- trigger FN-001 sobrescreve
    FROM colaborador c
    CROSS JOIN generate_series(v_inicio, v_fim, interval '1 day') d
    LEFT JOIN LATERAL (
      SELECT * FROM troca_escala te
       WHERE te.colaborador_id = c.id AND te.vigencia_inicio <= d::date
       ORDER BY te.vigencia_inicio DESC LIMIT 1
    ) t ON true
   WHERE c.ativo AND c.escala_ancora IS NOT NULL AND c.turno_padrao IS NOT NULL
     AND ((d::date - COALESCE(t.ancora, c.escala_ancora))
          % COALESCE(t.periodo, c.escala_periodo)
          + COALESCE(t.periodo, c.escala_periodo))
          % COALESCE(t.periodo, c.escala_periodo) = 0
  ON CONFLICT (colaborador_id, data) DO NOTHING;

  GET DIAGNOSTICS v_criados = ROW_COUNT;
  UPDATE ciclo SET escala_gerada_em = now() WHERE id = p_ciclo_id;
  RETURN v_criados;
END $$;
