# FN-015 — `conferir_medicamento`

- **ID:** FN-015
- **Status:** RASCUNHO — **alteração exige revisão humana**
- **Pré-requisitos:** `FN-012`, `03-banco/constraints-pacientes.md`
- **Regras:** RNP-14, RNP-17, RNP-25, RNP-26, RNP-28, RNP-30

2ª etapa da checagem dupla. É a função em que `chk_separador_conferente_distintos` (`DB-007`)
pode disparar — e deve ser tratada como erro esperado (`409`), não exceção não mapeada.

## Assinatura

```sql
conferir_medicamento(
  p_administracao_id uuid, p_colaborador_id uuid,
  p_confere boolean,              -- true = bate com a prescrição; false = divergência
  p_observacao text DEFAULT NULL  -- obrigatória quando p_confere = false
) RETURNS administracao_medicamento
```

## Ordem de execução

```
1. SELECT administracao FOR UPDATE
2. status atual = 'SEPARADO' (senão: ainda não separado, ou já avançou/divergiu)
3. p_colaborador_id <> separado_por_id (RNP-26) — checado aqui E pela constraint (defesa dupla)
4. p_confere = false → observacao obrigatória (RNP-17); UPDATE status = 'DIVERGENTE'
   p_confere = true  → UPDATE status = 'CONFERIDO', conferido_por_id, conferido_em
```

## Implementação

```sql
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
```

Note que `DIVERGENTE` também grava `conferido_por_id`/`conferido_em`: a linha divergente registra
quem a detectou e quando — é dado do incidente, não é descartado (`RNP-28`, "o registro divergente
permanece no histórico").

## Por que a checagem de `RNP-26` está na função **e** na constraint

A função dá o erro específico (`CONFERENTE_IGUAL_SEPARADOR`, mensagem clara ao usuário); a
constraint (`chk_separador_conferente_distintos`) é a rede de segurança caso outra função ou uma
correção manual tente gravar a mesma violação por outro caminho. Mesmo padrão de `valida_descanso`
(`FN-004`) vs. `excl_marcacao_sobreposta`.

## ACID

- **A/I:** `FOR UPDATE` na linha impede duas conferências simultâneas na mesma dose.
- **C:** `chk_separador_conferente_distintos`, `chk_ordem_etapas`, `chk_administracao_observacao`.
- **D:** auditoria (`MEDICACAO_CONFERIDA` ou `MEDICACAO_DIVERGENTE`) na mesma transação (`RNP-32`).

## Erros

`ADMINISTRACAO_INEXISTENTE` `404` · `DOSE_NAO_SEPARADA` `409` · `CONFERENTE_IGUAL_SEPARADOR`
`409` · `JUSTIFICATIVA_OBRIGATORIA` `422`

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F15-1 | Conferir dose `SEPARADO` por outro colaborador, confirma | `CONFERIDO` |
| F15-2 | Mesmo colaborador que separou tenta conferir | `CONFERENTE_IGUAL_SEPARADOR` |
| F15-3 | Conferir dose ainda `PENDENTE` (não separada) | `DOSE_NAO_SEPARADA` |
| F15-4 | Divergência sem observação | `JUSTIFICATIVA_OBRIGATORIA` |
| F15-5 | Divergência com observação | `DIVERGENTE`, `conferido_por_id` preenchido |
| F15-6 | Conferir dose já `CONFERIDO` | `DOSE_NAO_SEPARADA` (estado não é mais `SEPARADO`) |
