# API-AUTH-004 — `POST /api/auth/colaborador/logout`

- **ID:** API-AUTH-004
- **Status:** PRONTA
- **Ator:** Público (lê o cookie de sessão se houver — não exige sessão válida)
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

Rota pública no pipeline (`ator: 'PUBLICO'` em `defineHandler` — se fosse `'COLABORADOR'`,
o pipeline recusaria com 401 justamente o caso "sem sessão" que este endpoint precisa
aceitar). A rota lê o cookie `sessao_colaborador` diretamente de `request.cookies` e delega
a revogação, idempotente por construção, a `processarLogout`. Sem sessão, responde 204 assim
mesmo — logout é idempotente. É a única rota de `04-api/*` com essa forma "sessão opcional,
mas eu leio se tiver"; se o padrão se repetir em outra rota, vale formalizar um ator
`'OPCIONAL'` no contrato comum.

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
