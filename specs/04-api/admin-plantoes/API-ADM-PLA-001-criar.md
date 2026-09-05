# API-ADM-PLA-001 — `POST /api/admin/plantoes`

- **ID:** API-ADM-PLA-001
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/integridade.md`
- **Entregáveis:** `src/app/api/admin/plantoes/route.ts`

## Objetivo

Cria um plantão extra ofertado.

## Contrato

### Request
```ts
{ cicloId, rtId, data, tipo, horaInicio?, horaFim?, vagasTotais,
  permiteCruzada?: boolean | null, observacao? }
```

### Response 201
Plantão criado.

### Erros
`PLANTAO_JA_EXISTE` 409 · `CICLO_FECHADO` 409 · `DATA_FORA_DO_CICLO` 422

## Fluxo

1. Validar data dentro do mês do ciclo
2. Inserir (trigger calcula o intervalo)
3. Auditar `PLANTAO_CRIADO`
4. Broadcast se publicado

## ACID

**C:** `plantao_unico (ciclo, rt, data, tipo)` impede duplicata em concorrência; `23505` → `PLANTAO_JA_EXISTE`.

## CIA

**I:** `permiteCruzada = null` significa herdar do ciclo — a API distingue `null` de `false` explicitamente no schema Zod (`.nullable()`, não `.optional()`).

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Criação válida | 201, intervalo calculado |
| 2 | Duplicado | 409 |
| 3 | Data fora do mês | 422 |
| 4 | Ciclo fechado | 409 |
| 5 | `permiteCruzada: null` | herda do ciclo |
| 6 | Noturno | `fimEm` no dia seguinte |
