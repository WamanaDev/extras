# API-ADM-COL-010 — `POST /api/admin/colaboradores/:id/revogar-sessoes`

- **ID:** API-ADM-COL-010
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/colaboradores/[id]/revogar-sessoes/route.ts`

## Objetivo

Encerra todas as sessões de um colaborador. Usado em suspeita de comprometimento ou no desligamento.

## Contrato

### Request
```ts
{ motivo: string }
```

### Response 200
```ts
{ revogadas: number }
```

## Fluxo

1. `UPDATE sessao_colaborador SET revogada_em = now() WHERE colaborador_id = ? AND revogada_em IS NULL`
2. Auditar `SESSAO_REVOGADA` com a contagem e o motivo

## ACID

Uma transação. Idempotente: revogar de novo devolve 0.

## CIA

**C:** revogação é imediata porque toda requisição valida a sessão no banco
(`API-AUTH-005`), não só a assinatura do cookie. Se a validação fosse só do JWT, revogar
seria impossível antes da expiração.
**D:** ação de contenção; deve estar a um clique na tela do colaborador.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | 3 sessões ativas | 3 revogadas |
| 2 | Requisição com sessão revogada | 401 imediato |
| 3 | Sem sessões | 0, sem erro |
| 4 | Sem motivo | 422 |
