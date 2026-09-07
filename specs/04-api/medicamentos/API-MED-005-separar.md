# API-MED-005 — `POST /api/prescricoes/:id/separar`

- **ID:** API-MED-005
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `FN-012`, `SEC-SAUDE`, `RNP-25`
- **Entregáveis:** `src/app/api/prescricoes/[id]/separar/route.ts`

## Objetivo

1ª etapa da checagem dupla: qualquer colaborador da RT do paciente separa a dose. Renomeada de
"registrar administração" — o registro deixou de ser um passo único (ver `API-MED-008`
conferir, `API-MED-009` administrar).

## Contrato

### Request
```ts
{ horarioPrevisto?: string }   // obrigatório se prescrição REGULAR; omitido se PRN
```

### Response 201
Administração com `status = 'SEPARADO'`.

### Erros
`404` (prescrição de paciente de outra RT) · `PRESCRICAO_INATIVA` 409 · `FORA_DA_VIGENCIA` 409 ·
`DOSE_NAO_PREVISTA` 404 · `DOSE_JA_SEPARADA` 409 · `HORARIO_PREVISTO_OBRIGATORIO` 422

## Fluxo

1. Carregar prescrição → paciente → checar `rt_id` = RT do ator; `404` se não bater
2. Chamar `separar_medicamento` (`FN-012`) com `colaboradorId` = ator da sessão
3. Auditar `MEDICACAO_SEPARADA` (`RNP-32`)

## CIA

**I:** `colaboradorId` vem sempre da sessão, nunca do body — quem separou é quem está logado
(`API-000` "Ator").

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Separar dose `REGULAR` prevista | 201, `SEPARADO` |
| 2 | Separar `PRN` sem `horarioPrevisto` | 201, nova linha `SEPARADO` |
| 3 | Separar dose já separada | 409 |
| 4 | Prescrição de paciente de outra RT | 404 |
