# API-AUTH-003 — `POST /api/auth/colaborador/definir-pin`

- **ID:** API-AUTH-003
- **Status:** PRONTA — **alteração exige revisão humana**
- **Ator:** Token parcial
- **Pré-requisitos:** `API-AUTH-001`
- **Entregáveis:** `src/app/api/auth/colaborador/definir-pin/route.ts`

## Objetivo

Define o PIN no primeiro acesso ou após reset administrativo. Cria a sessão em seguida.

## Contrato

### Request
```ts
{ tokenParcial: string, pin: string, confirmacao: string }
```

### Response 200
Igual a `API-AUTH-002`.

### Erros
`PIN_FRACO` 422 · `PIN_NAO_CONFERE` 422 · `TOKEN_INVALIDO` 401 · `PIN_JA_DEFINIDO` 409

## Autorização

`tokenParcial` com `precisaDefinirPin = true`.

## Fluxo

1. Validar token e estado (`pinHash IS NULL` ou `precisaTrocarPin = true`)
2. Validar força do PIN (RN-30)
3. Hash argon2id + `PIN_PEPPER`
4. Gravar, marcar `pinDefinidoEm`, `precisaTrocarPin = false`
5. Auditar `PIN_DEFINIDO`
6. Criar sessão

## ACID

Passos 4–6 em uma transação.

## CIA

**RN-30 — PIN rejeitado se:** sequência crescente ou decrescente (`1234`, `4321`),
todos dígitos iguais (`1111`), ou entre os 20 mais comuns (`0000`, `1234`, `1122`…).

O PIN nunca aparece em log, resposta ou mensagem de erro.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | PIN válido | definido + sessão criada |
| 2 | `1234`, `1111`, `4321` | `PIN_FRACO` |
| 3 | Confirmação divergente | `PIN_NAO_CONFERE` |
| 4 | 3 dígitos ou 7 dígitos | `422` |
| 5 | PIN já definido | `PIN_JA_DEFINIDO` |
| 6 | Auditoria | `PIN_DEFINIDO` registrado |
