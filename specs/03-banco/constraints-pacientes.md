# Constraints — pacientes

- **ID:** DB-007
- **Status:** RASCUNHO — **alteração exige revisão humana**
- **Pré-requisitos:** `03-banco/constraints.md`, `03-banco/modelo-dados-pacientes.md`

Mesmo princípio de `DB-002`: constraint é a última linha. Se disparar em produção, uma camada
acima (`FN-010`/`FN-012`) falhou em barrar antes.

## Únicas

```sql
CREATE UNIQUE INDEX administracao_unica_prevista
  ON administracao_medicamento (prescricao_id, horario_previsto)
  WHERE horario_previsto IS NOT NULL;
```

`WHERE` exclui `PRN`, que não tem `horario_previsto` — várias administrações `PRN` da mesma
prescrição são esperadas.

## Checks

```sql
ALTER TABLE agendamento
  ADD CONSTRAINT chk_agendamento_intervalo CHECK (inicio_em < fim_em);

ALTER TABLE prescricao
  ADD CONSTRAINT chk_prescricao_vigencia CHECK (data_fim IS NULL OR data_inicio <= data_fim),
  ADD CONSTRAINT chk_prescricao_horarios CHECK (
    (tipo = 'PRN' AND horarios = '{}') OR (tipo = 'REGULAR' AND cardinality(horarios) > 0)
  );

ALTER TABLE administracao_medicamento
  ADD CONSTRAINT chk_administracao_prn CHECK (
    horario_previsto IS NOT NULL OR status IN ('ADMINISTRADO', 'RECUSADO')
  ),
  ADD CONSTRAINT chk_administracao_observacao CHECK (
    status <> 'RECUSADO' OR observacao IS NOT NULL
  );
```

`chk_administracao_prn`: uma administração sem horário previsto (PRN) só existe já resolvida —
nunca fica `PENDENTE` no ar, porque não há previsão para cobrar.

## Exclusion (sobreposição de intervalos) — `RNP-07`

```sql
-- btree_gist já habilitado por DB-002.

ALTER TABLE agendamento ADD CONSTRAINT excl_agendamento_sobreposto
  EXCLUDE USING gist (paciente_id WITH =, tstzrange(inicio_em, fim_em, '[)') WITH &&)
  WHERE (status NOT IN ('CANCELADO', 'NAO_COMPARECEU'));
```

Intervalo `[)` pelo mesmo motivo de `excl_marcacao_sobreposta`: agendamento que termina exatamente
quando outro começa não é conflito. `CANCELADO`/`NAO_COMPARECEU` saem da exclusão — cancelar e
reagendar no mesmo horário é o caso comum (`RNP-11`), não uma exceção.

## Códigos de erro → API

| SQLSTATE | Constraint | Erro da API | HTTP |
|---|---|---|---|
| `23P01` | `excl_agendamento_sobreposto` | `CONFLITO_AGENDA_PACIENTE` | 409 |
| `23505` | `administracao_unica_prevista` | `DOSE_JA_REGISTRADA` | 409 |
| `23514` | `chk_agendamento_intervalo` | `INTERVALO_INVALIDO` | 422 |
| `23514` | `chk_administracao_observacao` | `JUSTIFICATIVA_OBRIGATORIA` | 422 |
| `23503` | qualquer FK | `REFERENCIA_INVALIDA` | 409 |

Mapeamento entra no mesmo `src/server/db/erros.ts` de `DB-002`; não duplicar arquivo.

## Testes de aceitação (pgTAP)

| # | Teste | Esperado |
|---|---|---|
| B7-1 | Dois agendamentos do mesmo paciente sobrepostos, ambos `AGENDADO` | rejeitado `23P01` |
| B7-2 | Agendamento cancelado sobreposto a um novo | aceito |
| B7-3 | Duas administrações com mesmo `(prescricao_id, horario_previsto)` | rejeitado `23505` |
| B7-4 | Administração `PRN` sem `horario_previsto`, `status = PENDENTE` | rejeitado |
| B7-5 | Administração `RECUSADO` sem `observacao` | rejeitado |
| B7-6 | Prescrição `REGULAR` com `horarios = '{}'` | rejeitado |
