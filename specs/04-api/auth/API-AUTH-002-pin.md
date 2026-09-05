# API-AUTH-002 — `POST /api/auth/colaborador/pin`

- **ID:** API-AUTH-002
- **Status:** PRONTA — **alteração exige revisão humana**
- **Ator:** Token parcial
- **Pré-requisitos:** `API-AUTH-001`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/auth/colaborador/pin/route.ts`, `src/server/auth/sessao.ts`

## Objetivo

Segunda etapa. Valida o PIN e cria a sessão.

## Contrato

### Request
```ts
{ tokenParcial: string, pin: string }   // 4–6 dígitos
```

### Response 200
Cookie `sessao` (`httpOnly`, `Secure`, `SameSite=Lax`) + body:
```ts
{ colaborador: { id, nome, matricula, rt: { codigo, nome } }, expiraEm: string }
```

### Erros
`CREDENCIAIS_INVALIDAS` 401 · `TOKEN_INVALIDO` 401 · `CONTA_BLOQUEADA` 423 ·
`PIN_NAO_DEFINIDO` 409 · `MUITAS_TENTATIVAS` 429

## Autorização

Exige `tokenParcial` válido, não expirado e não usado.

## Fluxo

1. Validar assinatura, escopo e expiração do `tokenParcial`; marcar como consumido
2. Rate limit por matrícula
3. `argon2.verify(pinHash, pin + PIN_PEPPER)`
4. Registrar `tentativa_login` e auditar `LOGIN_SUCESSO` / `LOGIN_FALHA`
5. Sucesso: gerar token de 32 bytes, gravar **SHA-256** em `sessao_colaborador`,
   `expiraEm = now() + 8h`, setar cookie
6. Zerar `tentativasFalhas`

## ACID

Passos 4–6 em uma transação. Sessão criada sem log de auditoria é violação de `AUD-2`.

## CIA

**C:** só o hash do token vai ao banco — vazamento de dump não permite sequestro de
sessão. Cookie `httpOnly` impede leitura por JS (`SEC-STRIDE`, S3).
**I:** cookie assinado com `SESSION_SECRET`; rotação do segredo invalida tudo.
**D:** sessão de 8h limita a janela de um token roubado.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | PIN correto | cookie setado, sessão no banco |
| 2 | PIN errado | 401, `tentativasFalhas` +1 |
| 3 | Token parcial reutilizado | 401 |
| 4 | PIN não definido | `PIN_NAO_DEFINIDO` |
| 5 | Token de sessão em claro no banco | zero ocorrências |
| 6 | Cookie sem `httpOnly`/`Secure` | falha |
| 7 | 5 PINs errados | conta bloqueada |
