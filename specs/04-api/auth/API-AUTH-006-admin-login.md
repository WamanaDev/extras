# API-AUTH-006 — Login de admin (e-mail + senha)

- **ID:** API-AUTH-006
- **Status:** PRONTA
- **Ator:** Público
- **Pré-requisitos:** `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/auth/admin/login/route.ts`, `src/server/auth/admin-login.ts`,
  `src/server/auth/auditoria-login-admin.ts`, `src/server/auth/sessao-admin.ts`

## Objetivo

Login administrativo delegado ao Supabase Auth, só com e-mail e senha. Não há segundo fator
por ora (decisão do produto, ver `_conflitos.md`).

## Contrato

### `POST /api/auth/admin/login`
Request: `{ email: string, senha: string }`
Response 200: `{ admin: { id, email, nome } }` + sessão do Supabase gravada nos cookies
(`@supabase/ssr`)
Erros: `CREDENCIAIS_INVALIDAS` 401 · `LIMITE_EXCEDIDO` 429

## Autorização

Pública, com rate limit próprio, independente do fluxo de colaborador: 5/15min por e-mail
(`login_admin_email`) e 20/15min por IP (`login_admin_ip`).

## Fluxo

1. Delega a senha ao Supabase Auth (`signInWithPassword`), que grava a sessão nos cookies.
2. Senha errada → audita `LOGIN_ADMIN_FALHA` e responde `CREDENCIAIS_INVALIDAS` (401),
   mensagem genérica (não revela se o e-mail existe).
3. Senha certa → audita `LOGIN_ADMIN_SUCESSO` e devolve `{ admin }`.
4. Os guardas de admin (`resolverSessaoAdmin` em `src/server/http/handler.ts` e o layout de
   `/admin/*`) aceitam uma sessão válida do Supabase (`auth.getUser()`) — nada além disso.

## CIA

**C:** não há segundo fator por ora, por decisão do produto. A conta admin lê dados de
identificação de colaboradores, auditoria e dado de saúde em `observacao`: é a conta de maior
valor para um atacante, e uma senha vazada dá acesso total ao painel. Mitigações atuais: rate
limit por e-mail e por IP, auditoria de toda tentativa. Reavaliar a adoção de um segundo fator.
**I:** toda tentativa (sucesso ou falha) fica em `audit_log`.
**D:** rate limit independente do fluxo de colaborador — travar um não trava o outro.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Senha certa | sessão do Supabase gravada; `{ admin }`; `LOGIN_ADMIN_SUCESSO` |
| 2 | Senha errada | 401 genérico `CREDENCIAIS_INVALIDAS`; `LOGIN_ADMIN_FALHA` |
| 3 | Rate limit admin | 429; não afeta login de colaborador |
