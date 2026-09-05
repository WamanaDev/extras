# API-COL-007 — `GET /api/meu-saldo?cicloId=`

- **ID:** API-COL-007
- **Status:** PRONTA
- **Ator:** Colaborador
- **Pré-requisitos:** `FN-008`
- **Entregáveis:** `src/app/api/meu-saldo/route.ts`

## Objetivo

Saldo de extras do ator no ciclo. Usado pelo componente de saldo, atualizado via Realtime.

## Contrato

### Response 200
```ts
{ limite, usadas, restantes, permiteCruzada, bloqueado, motivoBloqueio }
```

## Autorização

Ator da sessão.

## Fluxo

Chama `FN-008`.

## ACID

Leitura. `restantes` nunca negativo (`GREATEST(…,0)`) — limite reduzido depois de marcações não produz saldo negativo na UI.

## CIA

**C:** só o próprio saldo.
**I:** `motivoBloqueio` é texto administrativo — não pode conter dado de saúde. Validado na
escrita (`API-ADM-PAR-001`).
**D:** rota leve, chamada a cada evento de Realtime. `private, max-age=5`.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Sem override | usa `limitePadrao` |
| 2 | Com override | usa override |
| 3 | Limite reduzido abaixo do usado | `restantes = 0` |
| 4 | Bloqueado | `bloqueado = true` + motivo |
| 5 | Canceladas | não contam em `usadas` |
