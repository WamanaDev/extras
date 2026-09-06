# FN-011 — `cancelar_agendamento`

- **ID:** FN-011
- **Status:** RASCUNHO
- **Pré-requisitos:** `FN-010`
- **Regras:** RNP-08, RNP-09

## Assinatura

```sql
cancelar_agendamento(
  p_agendamento_id uuid, p_motivo text,
  p_ator_colaborador_id uuid DEFAULT NULL, p_ator_admin_id text DEFAULT NULL
) RETURNS agendamento
```

## Implementação

```sql
CREATE OR REPLACE FUNCTION cancelar_agendamento(
  p_agendamento_id uuid, p_motivo text,
  p_ator_colaborador_id uuid DEFAULT NULL, p_ator_admin_id text DEFAULT NULL
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
```

Quem pode chamar (RNP-09: criador, acompanhante designado ou admin) é decidido na rota
(`API-AGE-004`), com o mesmo racional de `FN-010` — a função valida integridade do dado, a rota
valida quem tem permissão de pedir a mutação.

## ACID

- **C:** transição de status restrita a partir de estados não-terminais; `AGENDAMENTO_JA_ENCERRADO`
  impede cancelar duas vezes ou reabrir um `REALIZADO`.
- **I:** `FOR UPDATE` evita corrida entre cancelar e, ao mesmo tempo, concluir (`FN-013`/`API-AGE-005`).
- **D:** auditoria na mesma transação, pelo handler.

## Erros

`MOTIVO_OBRIGATORIO` `422` · `AGENDAMENTO_INEXISTENTE` `404` · `AGENDAMENTO_JA_ENCERRADO` `409`

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F11-1 | Cancelar `AGENDADO` com motivo | `CANCELADO`, `cancelado_em` preenchido |
| F11-2 | Cancelar sem motivo | `MOTIVO_OBRIGATORIO` |
| F11-3 | Cancelar já `CANCELADO` | `AGENDAMENTO_JA_ENCERRADO` |
| F11-4 | Cancelar `REALIZADO` | `AGENDAMENTO_JA_ENCERRADO` |
| F11-5 | Cancelar e concluir em paralelo | uma vence, outra recebe estado já terminal |
