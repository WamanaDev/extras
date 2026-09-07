# FN-012 — `registrar_administracao`

- **ID:** FN-012
- **Status:** RASCUNHO
- **Pré-requisitos:** `02-seguranca/acid.md`, `03-banco/constraints-pacientes.md`, `SEC-SAUDE`
- **Regras:** RNP-13, RNP-14, RNP-15, RNP-17, RNP-20

Análogo de `FN-005` para o domínio de medicação: é onde toda regra de segurança do paciente
converge. Erro aqui é incidente clínico, não só bug.

## Assinatura

```sql
registrar_administracao(
  p_prescricao_id uuid, p_colaborador_id uuid,
  p_status status_administracao,           -- ADMINISTRADO | RECUSADO
  p_horario_previsto timestamptz DEFAULT NULL,  -- obrigatório se REGULAR; NULL se PRN
  p_observacao text DEFAULT NULL
) RETURNS administracao_medicamento
```

## Ordem de execução

```
1. SELECT prescricao FOR UPDATE
2. prescricao.status = 'ATIVA'
3. now() dentro de [data_inicio, data_fim] da prescrição (RNP-15)
4. REGULAR: horario_previsto obrigatório e deve casar com um dos `horarios`
   PRN: horario_previsto deve ser NULL
5. RECUSADO ou PRN: observacao obrigatória (RNP-17)
6. REGULAR: existe linha PENDENTE para (prescricao_id, horario_previsto)? atualiza-a (não insere nova)
   PRN: insere linha nova, já resolvida
```

## Implementação

```sql
CREATE OR REPLACE FUNCTION registrar_administracao(
  p_prescricao_id uuid, p_colaborador_id uuid,
  p_status status_administracao,
  p_horario_previsto timestamptz DEFAULT NULL,
  p_observacao text DEFAULT NULL
) RETURNS administracao_medicamento
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_presc prescricao%ROWTYPE; v_existente administracao_medicamento%ROWTYPE;
  v_result administracao_medicamento%ROWTYPE;
BEGIN
  SELECT * INTO v_presc FROM prescricao WHERE id = p_prescricao_id FOR UPDATE;
  IF NOT FOUND OR v_presc.status <> 'ATIVA' THEN RAISE EXCEPTION 'PRESCRICAO_INATIVA'; END IF;

  IF now()::date < v_presc.data_inicio
     OR (v_presc.data_fim IS NOT NULL AND now()::date > v_presc.data_fim) THEN
    RAISE EXCEPTION 'FORA_DA_VIGENCIA';
  END IF;

  IF v_presc.tipo = 'REGULAR' AND p_horario_previsto IS NULL THEN
    RAISE EXCEPTION 'HORARIO_PREVISTO_OBRIGATORIO';
  END IF;
  IF v_presc.tipo = 'PRN' AND p_horario_previsto IS NOT NULL THEN
    RAISE EXCEPTION 'PRESCRICAO_PRN_SEM_HORARIO';
  END IF;
  IF (v_presc.tipo = 'PRN' OR p_status = 'RECUSADO')
     AND (p_observacao IS NULL OR btrim(p_observacao) = '') THEN
    RAISE EXCEPTION 'JUSTIFICATIVA_OBRIGATORIA';
  END IF;

  IF v_presc.tipo = 'REGULAR' THEN
    SELECT * INTO v_existente FROM administracao_medicamento
     WHERE prescricao_id = p_prescricao_id AND horario_previsto = p_horario_previsto
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DOSE_NAO_PREVISTA'; END IF;
    IF v_existente.status IN ('ADMINISTRADO', 'RECUSADO') THEN
      RAISE EXCEPTION 'DOSE_JA_REGISTRADA';
    END IF;

    UPDATE administracao_medicamento
       SET status = p_status, colaborador_id = p_colaborador_id,
           horario_administrado = now(), observacao = p_observacao
     WHERE id = v_existente.id
    RETURNING * INTO v_result;
  ELSE
    INSERT INTO administracao_medicamento (
      id, prescricao_id, colaborador_id, horario_previsto, horario_administrado,
      status, observacao
    ) VALUES (
      gen_random_uuid(), p_prescricao_id, p_colaborador_id, NULL, now(),
      p_status, p_observacao
    ) RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END $$;
```

## Por que `UPDATE`, não `INSERT`, para `REGULAR`

A linha `PENDENTE` já existe — foi gerada quando a prescrição foi criada (`RNP-16`, trigger em
`FN-010`-equivalente de prescrição). Registrar a administração é *resolver* essa linha, nunca
criar uma nova: é o que garante `RNP-20` (uma administração por horário previsto) sem depender
só da unique index para o caminho feliz — a index é a rede de segurança, não o mecanismo
primário.

## ACID

- **A:** update/insert único dentro da função; sem estado composto.
- **C:** `chk_administracao_observacao` e `administracao_unica_prevista` (`DB-007`) como última
  linha; nunca devem disparar se esta função está correta.
- **I:** `FOR UPDATE` na prescrição e na linha de administração previne duas pessoas registrando
  a mesma dose ao mesmo tempo.
- **D:** auditoria na mesma transação, pelo handler.

## Erros

`PRESCRICAO_INATIVA` · `FORA_DA_VIGENCIA` · `HORARIO_PREVISTO_OBRIGATORIO` ·
`PRESCRICAO_PRN_SEM_HORARIO` · `JUSTIFICATIVA_OBRIGATORIA` · `DOSE_NAO_PREVISTA` ·
`DOSE_JA_REGISTRADA` — todos `409`, exceto validação de shape (`422`, barrada por Zod antes).

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F12-1 | Registrar dose `REGULAR` prevista, no prazo | `ADMINISTRADO`, linha `PENDENTE` resolvida |
| F12-2 | Registrar a mesma dose duas vezes | segunda `DOSE_JA_REGISTRADA` |
| F12-3 | Registrar fora da vigência da prescrição | `FORA_DA_VIGENCIA` |
| F12-4 | Registrar `RECUSADO` sem observação | `JUSTIFICATIVA_OBRIGATORIA` |
| F12-5 | Registrar `PRN` sem observação | `JUSTIFICATIVA_OBRIGATORIA` |
| F12-6 | Registrar `PRN` com observação | insere nova linha já resolvida |
| F12-7 | Duas administrações paralelas para a mesma dose prevista | uma sucesso, outra `DOSE_JA_REGISTRADA` |
| F12-8 | Prescrição suspensa no meio do registro | `PRESCRICAO_INATIVA` |
