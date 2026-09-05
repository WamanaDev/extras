# API-ADM-PAR-001 — `PUT /api/admin/ciclos/:id/participacoes/:colaboradorId`

- **ID:** API-ADM-PAR-001
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/ciclos/[id]/participacoes/[colaboradorId]/route.ts`

## Objetivo

Define limite individual, permissão de cruzada e bloqueio de um colaborador no ciclo.

## Contrato

### Request
```ts
{ limiteOverride?: number | null, permiteCruzada?: boolean | null,
  bloqueado?: boolean, motivo?: string, confirmarImpacto?: boolean }
```

### Erros
`IMPACTO_NAO_CONFIRMADO` 409 · `CICLO_FECHADO` 409 · `MOTIVO_OBRIGATORIO` 422

## Fluxo

1. Advisory lock do colaborador
2. Reduzir o limite abaixo do já usado, ou bloquear com extras marcadas → impacto + confirmação
3. `upsert` na `participacao_ciclo`
4. Auditar `LIMITE_ALTERADO` / `CRUZADA_ALTERADA` com antes → depois
5. Broadcast `ciclo:atualizado`

## ACID

**A:** impacto e escrita numa transação.
**C:** `participacao_unica (ciclo, colaborador)` torna o `upsert` seguro sob concorrência.
**I:** advisory lock impede corrida com uma marcação em andamento do mesmo colaborador.

## CIA

**I:** `null` significa "herdar do ciclo" e é diferente de `0` ou `false`. O schema Zod
usa `.nullable()`, e a UI precisa de um controle de três estados — um checkbox de dois
estados não consegue expressar "herdar".
**C:** `motivo` é texto administrativo exibido ao colaborador em `API-COL-007`. Validar que
não contenha dado de saúde é responsabilidade do admin, mas o campo tem limite de 200 chars
e aviso na UI.
**R:** obrigatório em bloqueio e em redução de limite.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Definir override | aplicado |
| 2 | Voltar para `null` | herda do ciclo |
| 3 | Reduzir abaixo do usado | impacto + confirmação |
| 4 | Bloquear com extras | impacto listado |
| 5 | Bloquear sem motivo | 422 |
| 6 | Concorrente com marcação | serializado |
| 7 | Auditoria | antes → depois |
