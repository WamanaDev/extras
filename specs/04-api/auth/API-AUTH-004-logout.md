# API-AUTH-004 — `POST /api/auth/colaborador/logout`

- **ID:** API-AUTH-004
- **Status:** PRONTA
- **Ator:** Colaborador
- **Pré-requisitos:** `API-AUTH-002`
- **Entregáveis:** `src/app/api/auth/colaborador/logout/route.ts`

## Objetivo

Revoga a sessão atual e limpa o cookie.

## Contrato

### Request
Sem body.

### Response 204
Cookie expirado via `Set-Cookie` com `Max-Age=0`.

## Autorização

Sessão válida. Sem sessão, responde 204 assim mesmo — logout é idempotente.

## Fluxo

1. `UPDATE sessao_colaborador SET revogada_em = now()` pelo hash do token
2. Auditar `LOGOUT`
3. Expirar o cookie

## ACID

Uma transação. Revogar no banco **e** limpar o cookie — só limpar o cookie deixaria o token válido.

## CIA

**I:** revogação server-side é o que vale; o cookie é conveniência.
**D:** idempotente, nunca falha para o usuário.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Logout com sessão | `revogada_em` preenchido |
| 2 | Token revogado em request seguinte | 401 |
| 3 | Logout sem sessão | 204 |
| 4 | Logout 2× | 204 nas duas |
