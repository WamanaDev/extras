# API-AUTH-005 — `GET /api/auth/me`

- **ID:** API-AUTH-005
- **Status:** PRONTA
- **Ator:** Colaborador ou Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`
- **Entregáveis:** `src/app/api/auth/me/route.ts`

## Objetivo

Devolve o ator da sessão. Usado no boot do cliente para decidir a rota inicial.

## Contrato

### Response 200
```ts
{ tipo: 'COLABORADOR', colaborador: { id, nome, matricula, rt } , expiraEm }
| { tipo: 'ADMIN', admin: { id, email, nome } }
```

### Erros
`401` sem sessão.

## Autorização

Sessão válida de qualquer tipo.

## Fluxo

1. Validar sessão
2. Renovar deslizante se restar < 2h e o teto de 12h não foi atingido
3. Atualizar `ultimoUsoEm`

## ACID

Renovação e `ultimoUsoEm` no mesmo `UPDATE`.

## CIA

**C:** nunca retorna hash de PIN. `Cache-Control: private, no-store`.
**D:** rota chamada em todo boot — deve ser leve (< 50 ms), sem join desnecessário.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Sessão válida | 200 com ator |
| 2 | Sem sessão | 401 |
| 3 | Sessão expirada | 401 |
| 4 | Sessão revogada | 401 |
| 5 | Restando 1h | renova para 8h, respeitando teto de 12h |
| 6 | Payload contém PIN ou hash | falha |
