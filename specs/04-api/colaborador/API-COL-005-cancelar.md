# API-COL-005 — `DELETE /api/marcacoes/:id`

- **ID:** API-COL-005
- **Status:** PRONTA
- **Ator:** Colaborador
- **Pré-requisitos:** `SolicitacaoCancelamento` (`API-ADM-MAR-004` para aprovação/recusa)
- **Entregáveis:** `src/app/api/marcacoes/[id]/route.ts`,
  `src/server/services/colaborador/solicitar-cancelamento.ts`

## Objetivo

Abre um pedido de cancelamento (`solicitacao_cancelamento`, `PENDENTE`) para uma extra
própria. **Não cancela mais na hora** — pedido do usuário: colaborador não decide sozinho o
próprio cancelamento; qualquer admin precisa aprovar (`API-ADM-MAR-004`) antes de
`cancelar_extra` (`FN-006`) rodar de fato, com origem `ADMIN`.

Mesma URL/verbo do fluxo anterior (que chamava `cancelar_extra` direto, origem
`COLABORADOR`) — deliberado, para não exigir mudança nos três lugares da UI que já chamam
`del('/api/marcacoes/:id')`. Só a forma da resposta mudou.

## Contrato

### Request
```ts
{ motivo: string } // obrigatório — é o que o admin vê antes de aprovar ou recusar
```

### Response 200
```ts
{ id, marcacaoId, status: 'PENDENTE', jaExistia: boolean }
```
`jaExistia` é `true` quando já havia um pedido `PENDENTE` para esta marcação e a chamada
devolveu ele em vez de criar um novo (idempotência, ver abaixo).

### Erros
`MARCACAO_INEXISTENTE` 404 · marcação já `CANCELADA` 409 · ciclo `FECHADO` 409

## Autorização

Só a própria marcação. Marcação de terceiro → `404`, não `403` (`SEC-CONF`): `403`
confirmaria que o id existe. Checado com `findFirst` filtrando por `colaboradorId` — "de
terceiro" e "inexistente" chegam ao mesmo 404 por construção, sem checagem de propriedade
separada.

## Fluxo

1. Verificar propriedade + marcação `CONFIRMADA` + ciclo não `FECHADO`
2. Se já existe `solicitacao_cancelamento` `PENDENTE` para a marcação, devolver ela
   (`jaExistia: true`), sem criar duplicata
3. `$transaction`: `create` da solicitação + auditoria (`CANCELAMENTO_SOLICITADO`, ator
   `COLABORADOR`)
4. Commit — nenhuma marcação é alterada aqui; `cancelar_extra` só roda na aprovação
   (`API-ADM-MAR-004`)

## ACID

`create` + auditoria numa transação. Idempotente por construção: `findFirst` antes do
`create` cobre o caso comum; sob concorrência real, o índice único parcial
`solicitacao_cancelamento_pendente_unica` (`WHERE status = 'PENDENTE'`, ver
`03-banco/modelo-dados.md`) é a decisão final do banco — se o `create` colidir com a
violação de unicidade, o serviço recupera a solicitação existente em vez de propagar 500.
Nunca mais de um pedido `PENDENTE` por marcação ao mesmo tempo.

## CIA

**C:** `404` uniforme para inexistente e de terceiro.
**I:** este endpoint nunca faz `UPDATE`/`DELETE` em `marcacao` — só `INSERT` em
`solicitacao_cancelamento`. A mudança de status da marcação é responsabilidade exclusiva de
`cancelar_extra` (`FN-006`), acionado só na aprovação.
**D:** idempotente — dois pedidos seguidos para a mesma marcação devolvem a mesma
solicitação `PENDENTE`.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Pedido dentro da janela | 200, `solicitacao_cancelamento` criada `PENDENTE`, marcação continua `CONFIRMADA` |
| 2 | Ciclo fechado | 409, nenhuma solicitação criada |
| 3 | De terceiro | 404 |
| 4 | Inexistente | 404, mesma resposta do item 3 |
| 5 | 2× seguidas | `jaExistia: true` na segunda, uma única solicitação no banco |
| 6 | Sem `motivo` | 422 |
| 7 | Marcação já `CANCELADA` | 409 |
| 8 | Concorrência (dois requests simultâneos) | índice único parcial garante uma só `PENDENTE`, sem 500 |
