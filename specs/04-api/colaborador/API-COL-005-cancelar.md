# API-COL-005 — `DELETE /api/marcacoes/:id`

- **ID:** API-COL-005
- **Status:** PRONTA
- **Ator:** Colaborador
- **Pré-requisitos:** `FN-006`
- **Entregáveis:** `src/app/api/marcacoes/[id]/route.ts`

## Objetivo

Cancela uma extra própria dentro da janela.

## Contrato

### Response 200
```ts
{ id, status: 'CANCELADA', saldo: { limite, usadas, restantes } }
```

### Erros
`MARCACAO_INEXISTENTE` 404 · `JANELA_ENCERRADA` 409 · `CICLO_FECHADO` 409

## Autorização

Só a própria marcação. Marcação de terceiro → `404`, não `403` (`SEC-CONF`):
`403` confirmaria que o id existe.

## Fluxo

1. Verificar propriedade
2. `$transaction`: `cancelar_extra` + auditoria
3. Commit
4. Broadcast `marcacao:cancelada`

## ACID

Update + decremento + auditoria numa transação. Cancelar já cancelado é no-op
idempotente — duplo clique não decrementa duas vezes (`FN-006`).

## CIA

**C:** `404` uniforme para inexistente e de terceiro.
**I:** `UPDATE`, nunca `DELETE` — histórico preservado e `app_server` sem permissão.
**D:** idempotente.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Cancelamento na janela | 200, contador −1 |
| 2 | Após fechamento | `JANELA_ENCERRADA` |
| 3 | De terceiro | 404 |
| 4 | Inexistente | 404, mesma resposta do item 3 |
| 5 | 2× | idempotente, contador −1 só |
| 6 | Remarcar depois | permitido |
