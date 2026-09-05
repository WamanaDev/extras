# API-ADM-PLA-004 — `DELETE /api/admin/plantoes/:id`

- **ID:** API-ADM-PLA-004
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/integridade.md`
- **Entregáveis:** `src/app/api/admin/plantoes/[id]/route.ts`

## Objetivo

Remove (desativa) um plantão ofertado.

## Contrato

### Request
```ts
{ confirmarCancelamentos?: boolean, motivo?: string }
```

### Response 200
```ts
{ id, ativo: false, marcacoesCanceladas: number }
```

### Erros
`IMPACTO_NAO_CONFIRMADO` 409 · `CICLO_FECHADO` 409

## Fluxo

1. `FOR UPDATE`
2. Havendo marcações confirmadas e sem confirmação → 409 com a lista de afetados
3. Confirmado: cancelar cada marcação via `FN-006` e desativar o plantão
4. Auditar `PLANTAO_REMOVIDO` com o motivo e os afetados
5. Broadcast

## ACID

**A:** cancelamentos + desativação numa transação. **I:** advisory locks em ordem crescente de colaborador, mesmo padrão de `API-ADM-PLA-003`.

## CIA

**I:** `ativo = false`, nunca `DELETE` — o histórico das marcações canceladas precisa
apontar para um plantão existente.
**R:** `motivo` obrigatório quando há cancelamentos. Cancelar plantão de alguém sem registrar
por quê é o tipo de coisa que vira discussão depois.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Sem marcações | desativado |
| 2 | Com marcações, sem confirmar | 409 com nomes |
| 3 | Confirmado | marcações canceladas, saldos devolvidos |
| 4 | `DELETE` físico | não ocorre |
| 5 | Motivo ausente com cancelamentos | 422 |
