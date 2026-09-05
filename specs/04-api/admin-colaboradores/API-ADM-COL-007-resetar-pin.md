# API-ADM-COL-007 — `POST /api/admin/colaboradores/:id/resetar-pin`

- **ID:** API-ADM-COL-007
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/colaboradores/[id]/resetar-pin/route.ts`

## Objetivo

Reseta o PIN quando o colaborador esquece. Ele define um novo no próximo acesso.

## Contrato

### Request
```ts
{ motivo: string }
```

### Response 200
```ts
{ id, pinDefinido: false, sessoesRevogadas: number }
```

## Fluxo

1. `pinHash = NULL`, `precisaTrocarPin = true`
2. Revogar **todas** as sessões ativas
3. Zerar `tentativasFalhas` e `bloqueadoAte`
4. Auditar `PIN_RESETADO` com o motivo

## ACID

Os quatro passos numa transação. Resetar o PIN sem revogar sessões deixaria uma sessão viva com o PIN antigo já invalidado.

## CIA

**C:** o admin **não** define o PIN da pessoa. Definir PIN por terceiro destruiria o
valor do PIN como fator de autenticação — o admin passaria a poder marcar plantões em nome
de qualquer um, com o `audit_log` culpando a vítima (`SEC-STRIDE`, S1).
**R:** `motivo` obrigatório; reset de credencial é o pedido mais comum em engenharia social.
**D:** desbloqueia a conta junto, evitando um segundo chamado.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Reset | `pinHash = NULL` |
| 2 | Sessões ativas | revogadas |
| 3 | Próximo login | fluxo de definir PIN |
| 4 | Admin definindo o PIN | rota não existe |
| 5 | Sem motivo | 422 |
| 6 | Conta bloqueada | desbloqueada junto |
