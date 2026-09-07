# FN-016 — `administrar_medicamento`

- **ID:** FN-016
- **Status:** RASCUNHO — **alteração exige revisão humana**
- **Pré-requisitos:** `FN-015`, `03-banco/constraints-pacientes.md`
- **Regras:** RNP-14, RNP-17, RNP-25, RNP-27, RNP-30

3ª e última etapa. Onde `chk_administrador_participou` (`DB-007`) protege o paciente de alguém
que não passou pela checagem dupla dar a dose.

## Assinatura

```sql
administrar_medicamento(
  p_administracao_id uuid, p_colaborador_id uuid,
  p_status status_administracao,   -- ADMINISTRADO | RECUSADO
  p_observacao text DEFAULT NULL   -- obrigatória se RECUSADO
) RETURNS administracao_medicamento
```

## Implementação

```sql
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
```

`observacao` usa `COALESCE(p_observacao, observacao)` porque a linha pode já ter uma observação
da etapa de conferência (`CONFERIDO` sempre permite observação livre, não só em divergência) —
administrar não apaga o que a conferência anotou, só complementa se vier algo novo.

## ACID

- **A/I:** `FOR UPDATE` impede duas tentativas de administrar a mesma dose ao mesmo tempo.
- **C:** `chk_administrador_participou`, `chk_ordem_etapas`, `chk_administracao_observacao`.
- **D:** auditoria (`MEDICACAO_ADMINISTRADA`/`MEDICACAO_RECUSADA`) na mesma transação (`RNP-32`).

## Erros

`ADMINISTRACAO_INEXISTENTE` `404` · `DOSE_NAO_CONFERIDA` `409` · `ADMINISTRADOR_NAO_PARTICIPOU`
`409` · `JUSTIFICATIVA_OBRIGATORIA` `422`

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F16-1 | Administrar `CONFERIDO`, ator = separador | `ADMINISTRADO` |
| F16-2 | Administrar `CONFERIDO`, ator = conferente | `ADMINISTRADO` |
| F16-3 | Administrar `CONFERIDO`, ator = terceiro colaborador | `ADMINISTRADOR_NAO_PARTICIPOU` |
| F16-4 | Administrar dose ainda `SEPARADO` (não conferida) | `DOSE_NAO_CONFERIDA` |
| F16-5 | `RECUSADO` sem observação | `JUSTIFICATIVA_OBRIGATORIA` |
| F16-6 | Duas tentativas paralelas de administrar a mesma dose | uma sucesso, outra `DOSE_NAO_CONFERIDA` |
