# API-AUTH-006 — Login de admin (senha + código no WhatsApp)

- **ID:** API-AUTH-006
- **Status:** PRONTA
- **Ator:** Público
- **Pré-requisitos:** `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/auth/admin/login/route.ts`,
  `src/app/api/auth/admin/codigo/enviar/route.ts`,
  `src/app/api/auth/admin/codigo/verificar/route.ts`,
  `src/server/auth/segundo-fator.ts`, `src/server/auth/codigo-whatsapp.ts`,
  `src/server/integracoes/evolution.ts`

## Objetivo

Login administrativo em duas etapas: senha no Supabase Auth + código de 6 dígitos enviado
pelo WhatsApp (Evolution API). Segundo fator obrigatório.

Substituiu o MFA TOTP do Supabase (app autenticador), que era atrito demais para a equipe.

## Contrato

### `POST /api/auth/admin/login` — etapa 1 (senha)
Request: `{ email: string, senha: string }`
Response 200: `{ precisaCodigo: true, destino: string }` (`destino` = `•••• 4321`)
Erros: `CREDENCIAIS_INVALIDAS` 401 · `WHATSAPP_NAO_CADASTRADO` 403 ·
`WHATSAPP_INDISPONIVEL` 503 · `LIMITE_EXCEDIDO` 429

### `POST /api/auth/admin/codigo/enviar` — reenvio
Sem corpo; exige a sessão de senha da etapa 1.
Response 200: `{ precisaCodigo: true, destino }` ou `{ jaVerificado: true }`
Erros: `NAO_AUTENTICADO` 401 · `WHATSAPP_NAO_CADASTRADO` 403 · `WHATSAPP_INDISPONIVEL` 503 ·
`LIMITE_EXCEDIDO` 429

### `POST /api/auth/admin/codigo/verificar` — etapa 2 (código)
Request: `{ codigo: string }` (6 dígitos)
Response 200: `{ admin: { id, email, nome } }` + cookie `admin_2fa`
Erros: `NAO_AUTENTICADO` 401 · `CODIGO_INVALIDO` 401 · `CODIGO_EXPIRADO` 401 · `LIMITE_EXCEDIDO` 429

## Autorização

Públicas, com rate limit próprio (5/15min por e-mail — também limita quantos códigos são
disparados —, 20/15min por IP).

## Fluxo

1. Etapa 1 delega a senha ao Supabase Auth, que grava a sessão (cookies `@supabase/ssr`).
2. O WhatsApp vem de `app_metadata.whatsapp` — só a service role escreve ali (nunca
   `user_metadata`, que o próprio usuário edita com a sessão de senha). Sem número → bloqueado.
3. Código de 6 dígitos: guardado só como HMAC no Upstash Redis, TTL de 10 min, uso único,
   preso ao `session_id` da sessão do Supabase, 5 tentativas.
4. Acerto grava o cookie `admin_2fa` (HMAC com `SESSION_SECRET` sobre usuário + `session_id` +
   expiração) e audita `LOGIN_ADMIN_SUCESSO`; senha ou código errado auditam `LOGIN_ADMIN_FALHA`.
5. Os guardas de admin (`resolverSessaoAdmin`, layout de `/admin/*`) exigem sessão do Supabase
   **e** `admin_2fa` válido para o mesmo usuário e sessão. Só senha → `/admin/verificar`.

O WhatsApp é cadastrado por outro admin (obrigatório no convite; editável na tela
Administradores — `PATCH /api/admin/administradores/:id`, auditado como
`ADMIN_WHATSAPP_ALTERADO`) ou por `scripts/admin-whatsapp.ts`/`ADMIN_INICIAL_WHATSAPP` no
primeiro acesso.

## CIA

**C:** segundo fator obrigatório — a conta admin lê dados de identificação de colaboradores,
auditoria e dado de saúde em `observacao`. É a conta de maior valor para um atacante. Código
por WhatsApp é mais fraco que TOTP (depende da conta de WhatsApp do admin), aceito em troca
de menos atrito.
**I:** segundo fator vale 4h (cookie `admin_2fa`); depois pede código de novo.
**D:** rate limit independente do fluxo de colaborador — travar um não trava o outro. Evolution
API fora do ar impede login de admin (falha fechada).

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Senha certa + WhatsApp cadastrado | código enviado, `precisaCodigo` |
| 2 | Sem WhatsApp cadastrado | `WHATSAPP_NAO_CADASTRADO` |
| 3 | Senha errada | 401 genérico |
| 4 | Código certo | `admin_2fa` gravado; vale 4h |
| 5 | Só senha, sem código | rotas `ADMIN` recusam; layout manda pra `/admin/verificar` |
| 6 | 5 códigos errados | código invalidado, precisa pedir outro |
| 7 | Rate limit admin | não afeta login de colaborador |
