# API-AGE-004 — `POST /api/agendamentos/:id/cancelar`

- **ID:** API-AGE-004
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `FN-011`, `RNP-08`, `RNP-09`
- **Entregáveis:** `src/app/api/agendamentos/[id]/cancelar/route.ts`

## Objetivo

Cancela agendamento com motivo obrigatório (`RNP-08`).

## Contrato

### Request
```ts
{ motivo: string }
```

### Response 200
Agendamento `CANCELADO`.

### Erros
`404` · `403` (mesma regra de `API-AGE-003`) · `MOTIVO_OBRIGATORIO` 422 · `AGENDAMENTO_JA_ENCERRADO` 409

## Fluxo

1. Carregar agendamento restrito à RT do ator
2. Checar permissão (`RNP-09`)
3. Chamar `cancelar_agendamento` (`FN-011`)
4. Auditar `AGENDAMENTO_CANCELADO`

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Cancelar com motivo | 200 |
| 2 | Sem motivo | 422 |
| 3 | Já cancelado | 409 |
| 4 | Colaborador sem permissão (`RNP-09`) | 403 |
