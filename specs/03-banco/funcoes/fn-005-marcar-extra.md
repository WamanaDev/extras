# FN-005 — `marcar_extra`

- **ID:** FN-005
- **Status:** PRONTA — **alteração exige revisão humana**
- **Pré-requisitos:** `02-seguranca/acid.md`, `FN-003`, `FN-004`
- **Regras:** RN-16, RN-18 a RN-25, RN-27

Ponto de maior contenção do sistema. Toda regra de extra converge aqui.

## Assinatura

```sql
marcar_extra(
  p_plantao_id uuid, p_colaborador_id uuid,
  p_origem origem_marcacao DEFAULT 'COLABORADOR',
  p_ip text DEFAULT NULL, p_user_agent text DEFAULT NULL
) RETURNS marcacao
```

## Ordem de execução (obrigatória)

A ordem não é estética: define a prevenção de deadlock e a mensagem que o usuário vê.

```
1.  advisory lock do colaborador        ← SEMPRE primeiro (SEC-ACID)
2.  SELECT plantao FOR UPDATE
3.  ciclo: existe, PUBLICADO, dentro da janela
4.  colaborador ativo
5.  participacao: não bloqueado
6.  RT cruzada
7.  ausência no dia (e no dia seguinte, se NOTURNO)
8.  valida_descanso (FN-004)
9.  limite do ciclo
10. vagas
11. INSERT + UPDATE contador
```

Passos 6–10 vão do mais específico ao mais genérico, para que o usuário receba o motivo mais
informativo. Quem é da RT1 tentando RT2 com cruzada desligada deve ver `CRUZADA_BLOQUEADA`,
não `SEM_VAGA` — mesmo que ambos sejam verdade.

### Passo 7 — ausência no dia (RN-16 estendida)

Um plantão NOTURNO (ex.: 19:00 → 07:00 do dia seguinte) "vaza" para a madrugada do dia
seguinte. Checar só `escala_dia.data = plantao.data` (dia nominal do plantão) deixa passar
uma extra que termina dentro de um dia de folga/férias registrado no dia seguinte — o
colaborador estaria de folga às 6h da manhã, cobrindo até 7h. Por isso o passo 7 varre os
dois dias candidatos, não só um:

```sql
e.data IN (v_plantao.data, CASE WHEN v_plantao.tipo = 'NOTURNO' THEN v_plantao.data + 1 END)
```

Para `DIURNO` a segunda posição do `IN` é `NULL` e nunca casa com nada — comportamento
idêntico ao de antes. Para `NOTURNO`, o dia seguinte entra na varredura. `EXISTS` (em vez de
`SELECT ... INTO`) porque agora pode haver até duas linhas candidatas; basta que **uma**
delas seja ausência (qualquer código ≠ `D`) para bloquear, sujeito à mesma flag
`permite_extra_em_folga` de sempre. Vale para qualquer código de ausência — o passo já era
agnóstico ao código específico, só a janela de dias mudou. `FN-007` espelha exatamente este
critério (mesma consulta) para que o motivo mostrado na grade nunca divirja do erro que
`marcar_extra` lançaria.

## Implementação

```sql
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
  PERFORM pg_advisory_xact_lock(hashtextextended(p_colaborador_id::text, 0));

  SELECT * INTO v_plantao FROM plantao WHERE id = p_plantao_id FOR UPDATE;
  IF NOT FOUND OR NOT v_plantao.ativo THEN RAISE EXCEPTION 'PLANTAO_INDISPONIVEL'; END IF;

  SELECT * INTO v_ciclo FROM ciclo WHERE id = v_plantao.ciclo_id;
  IF v_ciclo.status <> 'PUBLICADO' THEN RAISE EXCEPTION 'CICLO_FECHADO'; END IF;
  IF p_origem = 'COLABORADOR' THEN
    IF v_ciclo.abertura_marcacao IS NOT NULL AND now() < v_ciclo.abertura_marcacao
       THEN RAISE EXCEPTION 'JANELA_NAO_ABERTA'; END IF;
    IF v_ciclo.fechamento_marcacao IS NOT NULL AND now() > v_ciclo.fechamento_marcacao
       THEN RAISE EXCEPTION 'JANELA_ENCERRADA'; END IF;
  END IF;

  SELECT * INTO v_colab FROM colaborador WHERE id = p_colaborador_id AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'COLABORADOR_INATIVO'; END IF;

  SELECT * INTO v_part FROM participacao_ciclo
   WHERE ciclo_id = v_ciclo.id AND colaborador_id = p_colaborador_id;
  IF COALESCE(v_part.bloqueado, false) THEN RAISE EXCEPTION 'COLABORADOR_BLOQUEADO'; END IF;

  v_cruzada := v_plantao.rt_id <> v_colab.rt_id;
  IF v_cruzada AND NOT COALESCE(
       v_part.permite_cruzada, v_plantao.permite_cruzada, v_ciclo.permite_cruzada, false)
     THEN RAISE EXCEPTION 'CRUZADA_BLOQUEADA'; END IF;

  IF EXISTS (
    SELECT 1
      FROM escala_dia e JOIN codigo_escala ce ON ce.id = e.codigo_escala_id
     WHERE e.colaborador_id = p_colaborador_id
       AND e.data IN (v_plantao.data, CASE WHEN v_plantao.tipo = 'NOTURNO' THEN v_plantao.data + 1 END)
       AND ce.codigo <> 'D'
  ) AND NOT v_ciclo.permite_extra_em_folga
     THEN RAISE EXCEPTION 'EM_AUSENCIA'; END IF;

  v_erro := valida_descanso(p_colaborador_id, v_plantao.inicio_em, v_plantao.fim_em,
                            v_ciclo.max_blocos_seguidos);
  IF v_erro IS NOT NULL THEN RAISE EXCEPTION '%', v_erro; END IF;

  v_limite := COALESCE(v_part.limite_override, v_ciclo.limite_padrao);
  SELECT count(*) INTO v_usadas
    FROM marcacao m JOIN plantao p ON p.id = m.plantao_id
   WHERE m.colaborador_id = p_colaborador_id AND m.status = 'CONFIRMADA'
     AND p.ciclo_id = v_ciclo.id;
  IF v_usadas >= v_limite THEN RAISE EXCEPTION 'LIMITE_ATINGIDO'; END IF;

  IF v_plantao.vagas_ocupadas >= v_plantao.vagas_totais THEN RAISE EXCEPTION 'SEM_VAGA'; END IF;

  INSERT INTO marcacao (id, plantao_id, colaborador_id, status, cruzada, origem)
  VALUES (gen_random_uuid(), p_plantao_id, p_colaborador_id, 'CONFIRMADA', v_cruzada, p_origem)
  RETURNING * INTO v_result;

  UPDATE plantao SET vagas_ocupadas = vagas_ocupadas + 1 WHERE id = p_plantao_id;
  RETURN v_result;
END $$;
```

## ACID

- **A:** insert + increment na mesma transação. `RAISE EXCEPTION` desfaz tudo.
- **C:** `chk_vagas` e o índice único parcial pegam o que passar; nunca devem disparar.
- **I:** advisory lock por colaborador (limite e jornada) + `FOR UPDATE` no plantão (vagas).
  Ordem fixa previne deadlock. Ver anomalias A1–A6 em `SEC-ACID`.
- **D:** `audit_log` gravado pelo chamador **na mesma transação** (`AUD-2`). `marcacao` não
  tem colunas `ip`/`user_agent` — os parâmetros `p_ip`/`p_user_agent` não são gravados dentro
  desta função; ficam disponíveis para o chamador usar no `INSERT INTO audit_log` (que tem
  essas colunas).

## Por que a leitura do ciclo fica dentro

Ler o ciclo fora da transação abriria janela para o admin fechá-lo entre a validação e o
insert (anomalia A5). Dentro, com o advisory lock já tomado, o estado é consistente.

## Janela ignorada para admin

`p_origem = 'ADMIN'` pula só a checagem de janela (RN-27). **Todas** as demais — jornada,
limite, vaga, cruzada — continuam valendo. Admin pode alocar fora do prazo; não pode criar
escala ilegal.

## Erros

`PLANTAO_INDISPONIVEL` · `CICLO_FECHADO` · `JANELA_NAO_ABERTA` · `JANELA_ENCERRADA` ·
`COLABORADOR_INATIVO` · `COLABORADOR_BLOQUEADO` · `CRUZADA_BLOQUEADA` · `EM_AUSENCIA` ·
`CONFLITO_DE_HORARIO` · `EXCEDE_JORNADA` · `LIMITE_ATINGIDO` · `SEM_VAGA`

Todos → HTTP `409`. Mapeamento em `03-banco/constraints.md`.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F5-1 | Caminho feliz | marcação criada, contador +1 |
| F5-2 | 20 paralelas, 1 vaga | 1 sucesso, 19 `SEM_VAGA`, contador = 1 |
| F5-3 | 5 paralelas, limite 1 restante | 1 sucesso, 4 `LIMITE_ATINGIDO` |
| F5-4 | Paralelas formando 36h | uma passa, outra `EXCEDE_JORNADA` |
| F5-5 | RT cruzada desligada | `CRUZADA_BLOQUEADA` |
| F5-6 | Cruzada liberada só na `participacao` | permitido |
| F5-7 | Dia com `F`, flag desligada | `EM_AUSENCIA` |
| F5-8 | Dia com `F`, flag ligada | permitido |
| F5-7b | NOTURNO na véspera de dia com ausência (D+1), flag desligada | `EM_AUSENCIA` |
| F5-7c | DIURNO na véspera de dia com ausência (não cruza meia-noite) | permitido |
| F5-9 | Mesmo turno do plantão base | `CONFLITO_DE_HORARIO` |
| F5-10 | Turno adjacente | permitido |
| F5-11 | Ciclo fechado no meio | `CICLO_FECHADO`, sem linha órfã |
| F5-12 | Admin fora da janela | permitido |
| F5-13 | Admin criando 36h | `EXCEDE_JORNADA` |
| F5-14 | 2h de carga concorrente | zero deadlocks |
