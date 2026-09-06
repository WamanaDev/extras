# FN-010 — `criar_agendamento`

- **ID:** FN-010
- **Status:** RASCUNHO
- **Pré-requisitos:** `02-seguranca/acid.md`, `03-banco/constraints-pacientes.md`
- **Regras:** RNP-01, RNP-05, RNP-06, RNP-07

## Assinatura

```sql
criar_agendamento(
  p_paciente_id uuid, p_tipo tipo_agendamento, p_titulo text, p_local text,
  p_inicio_em timestamptz, p_fim_em timestamptz,
  p_acompanhante_colaborador_id uuid DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_origem origem_agendamento DEFAULT 'COLABORADOR',
  p_criado_por_colaborador_id uuid DEFAULT NULL,
  p_criado_por_admin_id text DEFAULT NULL
) RETURNS agendamento
```

## Ordem de execução

```
1. SELECT paciente FOR UPDATE   ← trava o paciente, evita corrida de sobreposição
2. paciente existe e está ATIVO
3. RT do ator == RT do paciente (RNP-01) — checagem redundante à da rota, defesa em profundidade
4. p_inicio_em < p_fim_em
5. p_origem = 'COLABORADOR' → não pode ser retroativo (p_inicio_em >= now())
6. INSERT com rt_id = paciente.rt_id (snapshot, RNP-03)
```

`FOR UPDATE` no paciente, não advisory lock: o recurso contencioso é a agenda *do paciente*, que
já tem linha própria — travar a linha basta, sem precisar de `hashtextextended` como em
`marcar_extra` (`FN-005`), que trava um colaborador sem linha de "agenda" dedicada.

## Implementação

```sql
CREATE OR REPLACE FUNCTION criar_agendamento(
  p_paciente_id uuid, p_tipo tipo_agendamento, p_titulo text, p_local text,
  p_inicio_em timestamptz, p_fim_em timestamptz,
  p_acompanhante_colaborador_id uuid DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_origem origem_agendamento DEFAULT 'COLABORADOR',
  p_criado_por_colaborador_id uuid DEFAULT NULL,
  p_criado_por_admin_id text DEFAULT NULL
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
```

A checagem `RT do ator == RT do paciente` (passo 3) é feita **na rota** (`API-AGE-002`), que já
sabe a RT do colaborador autenticado via sessão — não é reproduzida aqui porque a função não
recebe o ator, só o resultado da decisão. A função em si é agnóstica de quem chama; a
autorização é responsabilidade do handler (`API-000`), a integridade de dado é desta função.

## ACID

- **A:** insert único; sem estado composto de duas chamadas.
- **C:** `excl_agendamento_sobreposto` (`DB-007`) pega qualquer sobreposição que escapar da
  checagem de aplicação; `RAISE EXCEPTION` na violação vira `23P01` → `409`.
- **I:** `FOR UPDATE` no paciente serializa duas criações concorrentes para o mesmo paciente.
- **D:** `registrarAuditoria` na mesma transação, chamado pelo handler (`AUD-2`).

## Erros

`PACIENTE_INDISPONIVEL` · `INTERVALO_INVALIDO` · `AGENDAMENTO_RETROATIVO` ·
`CONFLITO_AGENDA_PACIENTE` (da constraint) — todos `409`, exceto `INTERVALO_INVALIDO` que a rota
já barra em `422` antes de chamar a função (validação Zod, `API-000`).

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F10-1 | Caminho feliz, consulta | agendamento `AGENDADO`, `rt_id` = RT do paciente |
| F10-2 | Paciente `INATIVO` | `PACIENTE_INDISPONIVEL` |
| F10-3 | `inicio_em >= fim_em` | `INTERVALO_INVALIDO` |
| F10-4 | Colaborador criando no passado | `AGENDAMENTO_RETROATIVO` |
| F10-5 | Admin criando no passado (registro tardio) | permitido |
| F10-6 | Duas criações paralelas sobrepostas para o mesmo paciente | uma sucesso, outra `CONFLITO_AGENDA_PACIENTE` |
| F10-7 | Duas criações paralelas para pacientes diferentes | ambas sucesso |
