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
{ tipo: 'COLABORADOR', colaborador: { id, nome, matricula, rt: { codigo, nome } } , expiraEm }
| { tipo: 'ADMIN', admin: { id, email, nome } }
```

`rt.codigo` é alimentado por `rt.nome` — mesma resolução de `API-AUTH-002` (`rt` não tem
coluna `codigo` própria).

### Erros
`401` sem sessão.

## Autorização

Sessão válida de qualquer tipo.

## Fluxo

1. Validar sessão
2. Renovar deslizante se restar < 2h e o teto de 12h não foi atingido

## ACID

Renovação de `expiraEm` num único `UPDATE`.

> Pendência conhecida: `sessao_colaborador` ainda não tem coluna `ultimoUsoEm` no schema
> (`prisma/schema.prisma` só tem `criadoEm`/`expiraEm`/`revogadaEm`/`ip`/`userAgent`), então
> esta rota não grava esse campo hoje. Adicionar a coluna é mudança de `03-banco/modelo-dados.md`
> e depende de revisão humana antes de virar migration.

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
