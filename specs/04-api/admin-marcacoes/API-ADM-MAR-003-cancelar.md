# API-ADM-MAR-003 — `DELETE /api/admin/marcacoes/:id`

- **ID:** API-ADM-MAR-003
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `FN-006`
- **Entregáveis:** `src/app/api/admin/marcacoes/[id]/route.ts`

## Objetivo

Cancelamento administrativo, inclusive fora da janela.

## Contrato

### Request
```ts
{ motivo: string }
```

### Response 200
```ts
{ id, status: 'CANCELADA', saldoColaborador: {...} }
```

### Erros
`CICLO_FECHADO` 409 · `MARCACAO_INEXISTENTE` 404

## Fluxo

1. `$transaction`: `cancelar_extra(id, 'ADMIN', adminId, ip, ua)`
2. Auditar com motivo
3. Broadcast

## ACID

Mesmas garantias de `FN-006`. Idempotente.

## CIA

**I:** ciclo `FECHADO` bloqueia mesmo para admin (RN-25) — depois do fechamento os
números já foram para a folha, e alterar sem trilha nova seria adulteração.
**R:** `motivo` obrigatório. Cancelar plantão de alguém sem registro vira palavra contra
palavra.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Cancelamento fora da janela | permitido |
| 2 | Ciclo fechado | 409 |
| 3 | Sem motivo | 422 |
| 4 | Saldo do colaborador | devolvido |
| 5 | 2× | idempotente |
| 6 | Auditoria | ator = admin + motivo |
