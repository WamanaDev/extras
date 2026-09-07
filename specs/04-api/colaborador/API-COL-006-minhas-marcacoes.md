# API-COL-006 — `GET /api/minhas-marcacoes?cicloId=`

- **ID:** API-COL-006
- **Status:** PRONTA
- **Ator:** Colaborador
- **Pré-requisitos:** `04-api/contrato-comum.md`
- **Entregáveis:** `src/app/api/minhas-marcacoes/route.ts`

## Objetivo

Histórico de extras do ator no ciclo, incluindo canceladas.

## Contrato

### Response 200
```ts
{
  marcacoes: Array<{ id, data, tipo, rt, horaInicio, horaFim, status, cruzada,
                     criadoEm, canceladoEm, podeCancelar: boolean,
                     cancelamentoPendente: boolean }>,
  totais: { confirmadas, canceladas, horas }
}
```
`cancelamentoPendente` é `true` quando já existe uma `solicitacao_cancelamento` `PENDENTE`
para a marcação (`API-COL-005` não cancela mais direto, só abre um pedido — ver
`API-ADM-MAR-004`). `podeCancelar` passa a considerar isso: `false` também quando há pedido
pendente, não só fora da janela ou marcação já `CANCELADA`.

## Autorização

Ator da sessão.

## Fluxo

1. Listar marcações do ator no ciclo
2. Buscar `solicitacao_cancelamento` `PENDENTE` das marcações listadas
3. Calcular `podeCancelar` (janela + status + ausência de pedido pendente) e
   `cancelamentoPendente`

## ACID

Leitura simples.

## CIA

**C:** só as próprias. `private, no-store`.
**I:** `podeCancelar` é calculado no servidor — a UI não deduz a partir da data.
**D:** paginação a partir de 50 itens.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Confirmadas e canceladas | ambas listadas |
| 2 | Fora da janela | `podeCancelar = false` |
| 3 | Marcação de terceiro | não aparece |
| 4 | Canceladas em `totais.horas` | não contam |
| 5 | Marcação com pedido `PENDENTE` | `podeCancelar = false`, `cancelamentoPendente = true` |
| 6 | Pedido `RECUSADA` (não `PENDENTE`) | `podeCancelar` volta a `true` se ainda na janela |
