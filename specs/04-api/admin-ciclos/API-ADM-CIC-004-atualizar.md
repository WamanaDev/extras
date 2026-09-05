# API-ADM-CIC-004 — `PATCH /api/admin/ciclos/:id`

- **ID:** API-ADM-CIC-004
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/integridade.md`
- **Entregáveis:** `src/app/api/admin/ciclos/[id]/route.ts`

## Objetivo

Altera limite padrão, flags e janela do ciclo.

## Contrato

### Request
```ts
{ limitePadrao?, permiteCruzada?, permiteExtraEmFolga?, maxBlocosSeguidos?,
  aberturaMarcacao?, fechamentoMarcacao?, confirmarImpacto?: boolean }
```

### Response 200
Ciclo atualizado + `impacto`.

### Erros
`CICLO_FECHADO` 409 · `IMPACTO_NAO_CONFIRMADO` 409

## Fluxo

1. Bloquear se `FECHADO`
2. Calcular impacto: reduzir `limitePadrao` afeta quem já excedeu; desligar `permiteCruzada`
   afeta marcações cruzadas existentes
3. Se houver impacto e `confirmarImpacto !== true`, devolver `IMPACTO_NAO_CONFIRMADO` com a lista
4. Aplicar, auditar `LIMITE_ALTERADO` / `CRUZADA_ALTERADA` com antes → depois
5. Broadcast `ciclo:atualizado`

## ACID

Cálculo de impacto e escrita na mesma transação — o impacto listado é o impacto aplicado.

## CIA

**I:** RN-28 — desligar cruzada **não** desfaz marcações existentes. Desfazer
automaticamente cancelaria plantão já combinado com a pessoa. O admin vê a lista e decide.
**R:** auditoria com antes → depois; sem isso, "quem reduziu meu limite?" é indiscutível.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Aumentar limite | aplicado direto |
| 2 | Reduzir abaixo do já usado | `IMPACTO_NAO_CONFIRMADO` com nomes |
| 3 | Mesma chamada confirmada | aplicada, marcações mantidas |
| 4 | Desligar cruzada com marcações cruzadas | lista o impacto |
| 5 | Ciclo fechado | 409 |
| 6 | Auditoria | antes e depois registrados |
