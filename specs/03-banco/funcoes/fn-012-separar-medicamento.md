# FN-012 — `separar_medicamento`

- **ID:** FN-012
- **Status:** RASCUNHO — **alteração exige revisão humana**
- **Pré-requisitos:** `02-seguranca/acid.md`, `03-banco/constraints-pacientes.md`, `SEC-SAUDE`
- **Regras:** RNP-13, RNP-15, RNP-16, RNP-25, RNP-29, RNP-30

1ª etapa da checagem dupla (`DOM-005` "O ciclo de uma dose"). Renomeada de `registrar_administracao`
— o fluxo deixou de ser um único registro e passou a três etapas (`FN-012` separar, `FN-015`
conferir, `FN-016` administrar), cada uma sua própria função, pelo mesmo racional de `FN-005`
(`marcar_extra`) vs. `FN-006` (`cancelar_extra`): operações com regra e ator diferentes não
dividem função.

## Assinatura

```sql
-- REGULAR: resolve uma linha PENDENTE já existente (gerada na criação da prescrição).
-- PRN: cria a linha ad-hoc e já a deixa SEPARADO na mesma chamada.
separar_medicamento(
  p_prescricao_id uuid, p_colaborador_id uuid,
  p_horario_previsto timestamptz DEFAULT NULL,   -- obrigatório se REGULAR; NULL se PRN
  p_administracao_id uuid DEFAULT NULL           -- alternativa a (prescricao_id, horario_previsto): retomar linha DIVERGENTE
) RETURNS administracao_medicamento
```

## Ordem de execução

```
1. SELECT prescricao FOR UPDATE
2. prescricao.status = 'ATIVA'
3. now() dentro de [data_inicio, data_fim] (RNP-15)
4. REGULAR: localizar (ou confirmar) a linha PENDENTE para p_horario_previsto
   PRN: inserir linha nova, status PENDENTE, horario_previsto NULL
5. status atual da linha = 'PENDENTE' (senão já foi separada por outra pessoa)
6. UPDATE: separado_por_id, separado_em = now(), status = 'SEPARADO'
```

## Implementação

```sql
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
```

`p_administracao_id` (retomar após `DIVERGENTE`) é tratado pela rota (`API-MED-008`): quando
informado, ela busca `prescricao_id`/`horario_previsto` da linha divergente e chama esta função
normalmente — não é um caminho de código separado aqui, é conveniência de API.

## ACID

- **A:** insert/update único; sem estado composto.
- **C:** `chk_ordem_etapas` e `administracao_unica_prevista` (`DB-007`) como rede de segurança.
- **I:** `FOR UPDATE` na prescrição e na linha de administração impede duas pessoas separando a
  mesma dose ao mesmo tempo — a segunda vê `DOSE_JA_SEPARADA`.
- **D:** auditoria (`MEDICACAO_SEPARADA`) na mesma transação, pelo handler (`RNP-32`).

## Erros

`PRESCRICAO_INATIVA` · `FORA_DA_VIGENCIA` · `HORARIO_PREVISTO_OBRIGATORIO` ·
`PRESCRICAO_PRN_SEM_HORARIO` · `DOSE_NAO_PREVISTA` · `DOSE_JA_SEPARADA` — todos `409`.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F12-1 | Separar dose `REGULAR` prevista | `SEPARADO`, `separado_por_id` preenchido |
| F12-2 | Separar `PRN` | nova linha `SEPARADO`, `horario_previsto` nulo |
| F12-3 | Separar a mesma dose duas vezes | segunda `DOSE_JA_SEPARADA` |
| F12-4 | Separar fora da vigência | `FORA_DA_VIGENCIA` |
| F12-5 | Prescrição suspensa no meio | `PRESCRICAO_INATIVA` |
| F12-6 | Duas separações paralelas para a mesma dose prevista | uma sucesso, outra `DOSE_JA_SEPARADA` |
| F12-7 | Separar de novo após `DIVERGENTE` no mesmo horário previsto | nova linha criada, linha divergente intacta |
