# API-AGE-005 — `POST /api/agendamentos/:id/concluir`

- **ID:** API-AGE-005
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `API-AGE-002`, `RNP-10`
- **Entregáveis:** `src/app/api/agendamentos/[id]/concluir/route.ts`

## Objetivo

Marca o desfecho do agendamento: `REALIZADO` ou `NAO_COMPARECEU`.

## Contrato

### Request
```ts
{ status: 'REALIZADO' | 'NAO_COMPARECEU', observacoes?: string }
```

### Response 200
Agendamento atualizado.

### Erros
`404` · `AGENDAMENTO_NAO_FINALIZAVEL` 409 (antes de `fim_em`, `RNP-10`) ·
`AGENDAMENTO_JA_ENCERRADO` 409

## Fluxo

1. Carregar agendamento restrito à RT do ator
2. `now() >= agendamento.fim_em`, senão `AGENDAMENTO_NAO_FINALIZAVEL` (`RNP-10`)
3. `UPDATE status`, anexar `observacoes` se houver
4. Auditar `AGENDAMENTO_CONCLUIDO`

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Concluir após `fim_em` | 200 |
| 2 | Concluir antes de `fim_em` | 409 |
| 3 | Concluir já `CANCELADO` | 409 |
| 4 | `NAO_COMPARECEU` | 200, status correto |
