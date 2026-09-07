# API-AUTH-006 — `POST /api/auth/admin/login`

- **ID:** API-AUTH-006
- **Status:** PRONTA
- **Ator:** Público
- **Pré-requisitos:** `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/auth/admin/login/route.ts`

## Objetivo

Login administrativo delegado ao Supabase Auth, com MFA obrigatório.

## Contrato

### Request
```ts
{ email: string, senha: string }
```

### Response 200
```ts
{ precisaMfa: true, desafioId: string } | { admin: {…} }
```

### Erros
`CREDENCIAIS_INVALIDAS` 401 · `MFA_OBRIGATORIO` 403 · `LIMITE_EXCEDIDO` 429

## Autorização

Pública, com rate limit próprio (5/15min por e-mail, 20/15min por IP).

## Fluxo

1. Delegar ao Supabase Auth
2. Exigir fator MFA — admin sem MFA é bloqueado até cadastrar
3. Auditar `LOGIN_ADMIN_SUCESSO` / `_FALHA`

`desafioId` no corpo de `{ precisaMfa: true, desafioId }` é o id do *challenge* criado no
servidor (`auth.desafiarFator`), mas a resposta não inclui o `factorId` que o SDK do Supabase
no navegador precisa para verificar esse mesmo challenge
(`supabase.auth.mfa.verify({ factorId, challengeId, code })`). Na prática, `/admin/login`
não reaproveita `desafioId`: na etapa de MFA o cliente lista os próprios fatores
(`supabase.auth.mfa.listFactors()`, já autenticado em `aal1` pelos cookies que esta rota
grava) e chama `mfa.challengeAndVerify({ factorId, code })`, que cria e verifica um challenge
novo numa chamada só. Efeito observável é idêntico; o challenge exibido em `desafioId` acaba
não sendo o usado na verificação. Uma evolução futura pode incluir `factorId` na resposta
para o cliente verificar o challenge exato que o servidor criou, evitando o segundo challenge.

## ACID

Auditoria na mesma transação da criação de sessão.

## CIA

**C:** MFA obrigatório — a conta admin lê dados de identificação de colaboradores, auditoria
e dado de saúde em `observacao`. É a conta de maior valor para um atacante.
**I:** sessão admin de 4h, mais curta que a do colaborador, por ter mais privilégio.
**D:** rate limit independente do fluxo de colaborador — travar um não trava o outro.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Credenciais + MFA | sessão criada |
| 2 | Sem MFA cadastrado | `MFA_OBRIGATORIO` |
| 3 | Senha errada | 401 genérico |
| 4 | Sessão admin | expira em 4h |
| 5 | Rate limit admin | não afeta login de colaborador |
