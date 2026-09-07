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
  WHERE horario_previsto IS NOT NULL AND status <> 'DIVERGENTE';
```

`horario_previsto IS NOT NULL` exclui `PRN`, que não tem horário previsto — várias
administrações `PRN` da mesma prescrição são esperadas. `status <> 'DIVERGENTE'` permite que uma
dose que deu divergência (`RNP-28`) gere uma **nova** linha para o mesmo horário previsto — a
linha divergente vira terminal e sai da unicidade, sem impedir a nova tentativa de separação.

## Checks

```sql
ALTER TABLE agendamento
  ADD CONSTRAINT chk_agendamento_intervalo CHECK (inicio_em < fim_em);

ALTER TABLE prescricao
  ADD CONSTRAINT chk_prescricao_vigencia CHECK (data_fim IS NULL OR data_inicio <= data_fim),
  ADD CONSTRAINT chk_prescricao_horarios CHECK (
    (tipo = 'PRN' AND horarios = '{}') OR (tipo = 'REGULAR' AND cardinality(horarios) > 0)
  ),
  -- RNP-24: duração define se data_fim é obrigatório ou proibido.
  ADD CONSTRAINT chk_prescricao_duracao CHECK (
    (duracao = 'TEMPORARIA' AND data_fim IS NOT NULL) OR
    (duracao = 'DEFINITIVA' AND data_fim IS NULL)
  );

ALTER TABLE administracao_medicamento
  ADD CONSTRAINT chk_administracao_observacao CHECK (
    status NOT IN ('RECUSADO', 'DIVERGENTE') OR observacao IS NOT NULL
  ),
  -- RNP-26: quem confere não pode ser quem separou a mesma dose.
  ADD CONSTRAINT chk_separador_conferente_distintos CHECK (
    separado_por_id IS NULL OR conferido_por_id IS NULL OR separado_por_id <> conferido_por_id
  ),
  -- RNP-27: quem administra é o separador ou o conferente — nunca um terceiro.
  ADD CONSTRAINT chk_administrador_participou CHECK (
    administrado_por_id IS NULL
    OR administrado_por_id = separado_por_id
    OR administrado_por_id = conferido_por_id
  ),
  -- Ordem das etapas: não existe conferência sem separação, nem administração sem conferência.
  ADD CONSTRAINT chk_ordem_etapas CHECK (
    (conferido_por_id IS NULL OR separado_por_id IS NOT NULL) AND
    (administrado_por_id IS NULL OR conferido_por_id IS NOT NULL)
  );
```

`chk_separador_conferente_distintos` e `chk_administrador_participou` são a checagem dupla
**na última linha de defesa** — mesmo que `FN-015`/`FN-016` tenham um bug, o banco recusa a
gravação de uma dose separada e conferida pela mesma pessoa, ou administrada por quem não
participou. Isso é constraint de segurança do paciente, não só de integridade de dado — por
isso é 🔒 (`AGENTS.md`).

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
| `23505` | `administracao_unica_prevista` | `DOSE_JA_SEPARADA` | 409 |
| `23514` | `chk_agendamento_intervalo` | `INTERVALO_INVALIDO` | 422 |
| `23514` | `chk_prescricao_duracao` | `VIGENCIA_INCONSISTENTE` | 422 |
| `23514` | `chk_administracao_observacao` | `JUSTIFICATIVA_OBRIGATORIA` | 422 |
| `23514` | `chk_separador_conferente_distintos` | `CONFERENTE_IGUAL_SEPARADOR` | 409 |
| `23514` | `chk_administrador_participou` | `ADMINISTRADOR_NAO_PARTICIPOU` | 409 |
| `23514` | `chk_ordem_etapas` | `ETAPA_FORA_DE_ORDEM` | 409 |
| `23503` | qualquer FK | `REFERENCIA_INVALIDA` | 409 |

Mapeamento entra no mesmo `src/server/db/erros.ts` de `DB-002`; não duplicar arquivo.

## Testes de aceitação (pgTAP)

| # | Teste | Esperado |
|---|---|---|
| B7-1 | Dois agendamentos do mesmo paciente sobrepostos, ambos `AGENDADO` | rejeitado `23P01` |
| B7-2 | Agendamento cancelado sobreposto a um novo | aceito |
| B7-3 | Duas administrações com mesmo `(prescricao_id, horario_previsto)` | rejeitado `23505` |
| B7-4 | Administração `RECUSADO` sem `observacao` | rejeitado |
| B7-5 | Prescrição `REGULAR` com `horarios = '{}'` | rejeitado |
| B7-6 | Prescrição `TEMPORARIA` sem `data_fim` | rejeitado |
| B7-7 | Prescrição `DEFINITIVA` com `data_fim` preenchido | rejeitado |
| B7-8 | `separado_por_id = conferido_por_id` | rejeitado `23514` |
| B7-9 | `administrado_por_id` diferente de `separado_por_id` e `conferido_por_id` | rejeitado `23514` |
| B7-10 | `conferido_por_id` preenchido com `separado_por_id` nulo | rejeitado `23514` |
| B7-11 | Nova linha de separação após divergência, mesmo `(prescricao_id, horario_previsto)` da linha `DIVERGENTE` | aceito |
