# API-COL-008 — Google Calendar (conectar, callback, status, sincronizar)

- **ID:** API-COL-008
- **Status:** PRONTA
- **Ator:** Colaborador
- **Pré-requisitos:** `DB-001` (model `GoogleCalendarConta`), `FUND-004` (env)
- **Entregáveis:**
  `src/app/api/colaborador/google-calendar/conectar/route.ts`,
  `src/app/api/colaborador/google-calendar/callback/route.ts`,
  `src/app/api/colaborador/google-calendar/route.ts`,
  `src/app/api/colaborador/google-calendar/sincronizar/route.ts`,
  `src/server/integracoes/google-calendar.ts`,
  `src/server/services/colaborador/google-calendar-sincronizar.ts`,
  `src/components/colaborador/GoogleCalendarBotao.tsx`

## Objetivo

Primeira integração externa real do sistema (fora Supabase/Upstash). Pedido do
usuário: botão pro colaborador conectar a conta Google e marcar
automaticamente, na agenda pessoal, os dias trabalhados do ciclo (escala base)
e as extras confirmadas — sem precisar copiar horário de plantão manualmente.

Sem dependência nova: `fetch` direto contra os endpoints REST do Google
(`oauth2.googleapis.com/token`, `www.googleapis.com/calendar/v3`) — o SDK
`googleapis` é pesado demais para 3 chamadas HTTP, mesmo espírito de
`push.ts` (infra mínima, sem SDK a mais).

Recurso opcional: sem `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
`CALENDAR_TOKEN_KEY` configuradas, a integração fica desabilitada (rotas
respondem `INTEGRACAO_DESABILITADA`/`disponivel: false`, botão não aparece) —
nunca quebra o boot da aplicação (ver `src/env.ts`, mesmo padrão de
`VAPID_*`/`CRON_SECRET`).

## Modelo de dados

`GoogleCalendarConta` (`google_calendar_conta`, ver `DB-001`):

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid | PK |
| `colaboradorId` | uuid | **único** — no máximo uma conta Google por colaborador |
| `refreshTokenCifrado` | text | AES-256-GCM, nunca em claro (ver "Segurança do token" abaixo) |
| `calendarioId` | text | default `"primary"` — o calendário principal da conta Google conectada |
| `criadoEm` | timestamptz | |
| `atualizadoEm` | timestamptz | tocado a cada sincronização bem-sucedida |

FK `colaboradorId → colaborador.id`, `onDelete: Cascade` — apagar o
colaborador apaga a conta Google associada, sem passo manual.

## Variáveis de ambiente

| Variável | Escopo | Descrição |
|---|---|---|
| `GOOGLE_CLIENT_ID` | server, opcional | Credencial OAuth do Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | server, opcional | Idem |
| `CALENDAR_TOKEN_KEY` | server, opcional | 64 hex chars (32 bytes) — chave AES-256-GCM. Gerar com `openssl rand -hex 32` |

`googleCalendarConfigurado()` retorna `true` só com as três presentes. As
rotas e o botão tratam a ausência como feature desabilitada, não como erro —
mesmo padrão de `VAPID_PRIVATE_KEY`/`CRON_SECRET` em `FUND-004`.

## Segurança do token

Só o `refresh_token` é persistido — o `access_token` é de curta duração
(~1h) e é pedido de novo a cada sincronização via `obterAccessToken`, nunca
gravado.

Cifra: AES-256-GCM, formato armazenado `iv:tag:cifrado` (hex, `:` como
separador). Reversível de propósito (diferente de hash de PIN) — a
sincronização precisa do refresh token em claro para chamar a API do Google,
não só confirmar posse. `CALENDAR_TOKEN_KEY` ausente faz `criptografar`/
`descriptografar` lançarem — nunca cai para armazenar em claro.

## Fluxo OAuth (RFC 6749, Authorization Code)

### 1. `GET /api/colaborador/google-calendar/conectar`

Fora do pipeline `defineHandler` de propósito (mesmo motivo do cron de
lembrete de extra): a resposta é sempre um **redirect de página inteira**
(302), nunca um envelope JSON — o contrato comum do `defineHandler` não
modela isso. Ainda assim resolve sessão com `resolverSessaoPadrao` (a mesma
função que `defineHandler` usa por baixo) — exige colaborador autenticado.

Fluxo:
1. Sem integração configurada → `501` JSON `{ erro: 'INTEGRACAO_DESABILITADA', … }`.
2. Sem sessão de colaborador → redirect para `/login`.
3. Gera `state` aleatório (`randomBytes(16)`, hex) e grava num cookie
   httpOnly `google_oauth_state` (`secure` em produção, `sameSite: lax`,
   `maxAge: 600` — 10 min de sobra para completar o consentimento).
4. Redireciona para a URL de autorização do Google
   (`accounts.google.com/o/oauth2/v2/auth`) com `redirect_uri` apontando
   para o próprio callback (`${origin}/api/colaborador/google-calendar/callback`),
   `scope=https://www.googleapis.com/auth/calendar.events`,
   `access_type=offline` **e** `prompt=consent` sempre juntos.

`access_type=offline&prompt=consent`: sem os dois, o Google só devolve
`refresh_token` na **primeira** autorização de cada usuário — reconectar
depois de revogar o acesso não devolveria um novo, e a aplicação ficaria com
um token morto sem saber disso.

### 2. `GET /api/colaborador/google-calendar/callback`

Também fora do `defineHandler` — resposta é sempre redirect para
`/minha-escala`, nunca JSON. `?googleCalendar=conectado|erro|recusado` é
anexado na URL de volta para a UI mostrar feedback.

Fluxo:
1. Sem sessão de colaborador → redirect para `/login`.
2. `?error=` presente (colaborador clicou "Cancelar" na tela do Google) →
   `?googleCalendar=recusado`. Não é tratado como erro da aplicação.
3. Valida `code`, `state` (querystring) e o cookie `google_oauth_state`:
   qualquer um ausente, ou `state !== stateCookie` → `?googleCalendar=erro`.
   Isso é a proteção CSRF do fluxo (RFC 6749 §10.12) — um `code` roubado sem
   o `state` correspondente (que só existe no cookie httpOnly da sessão que
   iniciou o fluxo) não é aceito.
4. Troca `code` por tokens (`trocarCodigoPorTokens`) usando o mesmo
   `redirect_uri` do passo 1 (exigência do OAuth — Google rejeita se
   divergir).
5. Cifra o `refresh_token` e faz `upsert` em `GoogleCalendarConta` por
   `colaboradorId` — reconectar substitui o token anterior, não duplica
   linha.
6. Cookie `google_oauth_state` é sempre removido na resposta final (sucesso
   ou erro) — de uso único.
7. Sucesso → `?googleCalendar=conectado`. Falha na troca/gravação → log
   redigido (`redigirParaLog`) + `?googleCalendar=erro`.

### 3. `GET /api/colaborador/google-calendar`

JSON normal via `defineHandler` (`ator: 'COLABORADOR'`, `cache: 'pessoal'`).

Response 200: `{ disponivel: boolean, conectado: boolean }`.
`disponivel: false` quando a integração não está configurada (`conectado`
sempre `false` nesse caso, sem consultar o banco). Usado pela UI para decidir
entre mostrar "Conectar" ou "Sincronizar/Desconectar".

### 4. `DELETE /api/colaborador/google-calendar`

JSON via `defineHandler`. Apaga o registro (`deleteMany` por
`colaboradorId` — no-op idempotente se já não houver conta). **Não revoga o
token do lado do Google** — a pessoa precisa fazer isso manualmente em
`myaccount.google.com/permissions` se quiser revogar de fato; a aplicação só
para de usar o token que tinha.

### 5. `POST /api/colaborador/google-calendar/sincronizar`

JSON via `defineHandler` (`ator: 'COLABORADOR'`, rate limit
`leitura_por_sessao` por cookie de sessão).

Request: `{ cicloId: string }` (uuid).

Response 200: `{ eventosEscala: number, eventosExtra: number }` — contagem
de dias/extras processados nesta chamada (não é o total acumulado no
calendário).

Erros: `REGRA_DE_NEGOCIO` 409 quando não há conta conectada (mensagem
"Conecte sua conta do Google Calendar antes de sincronizar.") ou quando
qualquer chamada ao Google falha (mensagem genérica de retry — a causa real
vai só para o log redigido, nunca para a resposta).

## Regra de negócio da sincronização (`sincronizarGoogleCalendar`)

1. Busca a conta pelo `colaboradorId`; sem conta → `GoogleCalendarNaoConectadoError`.
2. Renova o `access_token` a partir do refresh token cifrado
   (`obterAccessToken` — decifra, chama `oauth2.googleapis.com/token` com
   `grant_type=refresh_token`).
3. Dias que viram evento de escala: `escalaDia` do `colaboradorId`+`cicloId`
   **com `codigoEscala.presenca = true`** — só dias em que a pessoa
   efetivamente trabalha (folga/férias não têm utilidade numa agenda
   pessoal). Título fixo `"Plantão — Escala 12x36"`, descrição = descrição
   do código de escala, horário = `inicioEm`/`fimEm` já calculados por
   trigger (`preencher_intervalo`, ver `DB-003`/triggers) — a sincronização
   não recalcula intervalo, só usa o valor pronto.
4. Extras que viram evento: `marcacao` do `colaboradorId` com
   `status: 'CONFIRMADA'` e `plantao.cicloId` igual ao ciclo pedido — extras
   `PENDENTE`/`CANCELADA` nunca entram. Título `"Extra confirmada — RT
   {nome}"`, horário = `inicioEm`/`fimEm` da marcação.
5. Cada evento é gravado via `upsertEvento` com um id determinístico (ver
   abaixo) — nunca cria duplicata em execuções repetidas.
6. Ao final, toca `atualizadoEm` da conta (mesmo sem nenhum dia/extra
   processado).

### Idempotência do upsert

Google não tem "upsert" nativo de evento: `upsertEvento` tenta `POST`
(criar); se a resposta for `409` (evento com esse id já existe), refaz como
`PATCH` no mesmo id. Qualquer outro status de erro em ambas as tentativas
lança.

Ids são determinísticos a partir da linha de origem no banco, nunca gerados
aleatoriamente:
- Escala: `idEventoEscala(escalaDiaId)` → `"esc" + uuid sem hífens`.
- Extra: `idEventoExtra(marcacaoId)` → `"etr" + uuid sem hífens`.

Google exige o formato `^[a-v0-9]{5,1024}$` (base32hex minúsculo) para id de
evento. Um UUID sem hífens já usa só `0-9a-f`, subconjunto válido de
`0-9a-v` — daí bastar remover os hífens. O prefixo de extra é `etr`, não
`ext`: `x` está fora do alfabeto aceito pelo Google.

Consequência prática: sincronizar o mesmo ciclo várias vezes (novo dia
trabalhado adicionado, nova extra confirmada) atualiza os eventos já
existentes no lugar e cria só os novos — nunca duplica.

## Componente `<GoogleCalendarBotao cicloId=… />`

Usado em `/minha-escala` (e `/minha-escala-calendario`, mesma tela em
apresentação diferente). Não renderiza nada (`return null`) enquanto o
status inicial não chega, nem quando `disponivel: false`.

- **"Conectar"** é um `<a href="/api/colaborador/google-calendar/conectar">`
  — navegação de página inteira de propósito, porque o fluxo OAuth depende
  de redirects reais do browser, não de uma chamada `fetch`.
- **"Sincronizar"**/**"Desconectar"** são chamadas normais via
  `@/lib/api/client` (`post`/`del`) contra as rotas JSON.
- Lê `?googleCalendar=conectado|erro|recusado` via `useSearchParams` dentro
  de `<Suspense>` (exigência do Next para `useSearchParams` em página
  estática), recarrega o status e limpa o parâmetro da URL com
  `router.replace` — evita reprocessar a mesma mensagem num refresh manual.
- Mostra a contagem `eventosEscala`/`eventosExtra` do último `sincronizar`
  bem-sucedido; mensagem de erro (`role="alert"`) vem direto do envelope de
  erro da API.

## CIA

**C:** só a agenda do próprio colaborador é tocada — `colaboradorId` sempre
da sessão. O `state`/`code` do OAuth trafegam só entre o browser do
colaborador e o Google; o `refresh_token` nunca é exposto de volta ao
cliente, nem em log (`redigirParaLog` nos catches de `callback`/
`sincronizar`).
**I:** `refresh_token` cifrado em repouso (AES-256-GCM); `state` num cookie
httpOnly de uso único e vida curta (10 min) protege contra CSRF do
callback (RFC 6749 §10.12); `redirect_uri` fixo no código (nunca vindo de
querystring) evita open redirect no passo de troca de código.
**D:** integração é aditiva e best-effort — indisponibilidade do Google (ou
env ausente) nunca derruba `/minha-escala`, só desabilita o botão/rota.
Rate limit por sessão em `sincronizar` evita abuso.

## Erros

| Erro | Onde | Situação |
|---|---|---|
| `INTEGRACAO_DESABILITADA` (501) | `conectar` | env não configurada |
| redirect `/login` | `conectar`, `callback` | sem sessão de colaborador |
| `?googleCalendar=recusado` | `callback` | colaborador cancelou o consentimento no Google |
| `?googleCalendar=erro` | `callback` | `state` inválido/ausente, ou falha na troca de tokens |
| `REGRA_DE_NEGOCIO` (409) — "Conecte sua conta…" | `sincronizar` | sem `GoogleCalendarConta` para o colaborador |
| `REGRA_DE_NEGOCIO` (409) — mensagem genérica de retry | `sincronizar` | qualquer falha de rede/API do Google (`obterAccessToken`, `upsertEvento`) |

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | `GET conectar` sem env configurada | `501 INTEGRACAO_DESABILITADA` |
| 2 | `GET conectar` sem sessão | redirect `/login` |
| 3 | `GET conectar` com sessão válida | redirect para `accounts.google.com` com `state` no cookie e `access_type=offline&prompt=consent` |
| 4 | `GET callback` com `error=access_denied` | redirect `/minha-escala?googleCalendar=recusado` |
| 5 | `GET callback` com `state` divergente do cookie | `?googleCalendar=erro`, nenhuma gravação no banco |
| 6 | `GET callback` sem cookie de `state` | `?googleCalendar=erro` |
| 7 | `GET callback` caminho feliz | `GoogleCalendarConta` criada com refresh token cifrado; `?googleCalendar=conectado`; cookie `google_oauth_state` removido |
| 8 | Reconectar (conta já existe) | `upsert` substitui `refreshTokenCifrado`, não duplica linha (`colaboradorId` único) |
| 9 | `criptografar`/`descriptografar` round-trip | texto original recuperado |
| 10 | `descriptografar` com `CALENDAR_TOKEN_KEY` errada | lança (tag GCM não bate) |
| 11 | `GET /google-calendar` sem conta | `{ disponivel: true, conectado: false }` |
| 12 | `GET /google-calendar` com conta | `{ disponivel: true, conectado: true }` |
| 13 | `DELETE /google-calendar` sem conta | no-op, `{ desconectado: true }` |
| 14 | `POST sincronizar` sem conta conectada | `409 REGRA_DE_NEGOCIO`, mensagem de conectar primeiro |
| 15 | `POST sincronizar` com dias de folga (`presenca=false`) no ciclo | dias de folga não geram evento |
| 16 | `POST sincronizar` com extra `PENDENTE`/`CANCELADA` | não gera evento |
| 17 | `POST sincronizar` com extra `CONFIRMADA` | gera evento com título "Extra confirmada — RT {nome}" |
| 18 | `upsertEvento` quando o evento já existe (`409` do Google) | refaz como `PATCH`, não lança |
| 19 | `POST sincronizar` chamado 2× seguidas no mesmo ciclo | mesma contagem de eventos, nenhuma duplicata (mesmos ids) |
| 20 | `idEventoEscala`/`idEventoExtra` | só caracteres `a-v0-9`, sem hífen |
| 21 | `POST sincronizar` com falha de rede no Google | `409 REGRA_DE_NEGOCIO` genérico, erro real só no log redigido |
| 22 | Botão sem integração disponível | `<GoogleCalendarBotao>` não renderiza nada |
