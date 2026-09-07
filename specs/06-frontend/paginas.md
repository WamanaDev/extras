# Páginas

- **ID:** FE-001
- **Status:** PRONTA
- **Pré-requisitos:** `04-api/*`

## Mapa

```
/login                          → matrícula + PIN (login rápido, recorrente) POST /api/auth/colaborador/login-rapido
/login/cpf                      → matrícula (primeiro acesso / esqueci o PIN) API-AUTH-001, com link para /login
/login/pin                      → PIN                                 API-AUTH-002
/login/definir-pin              → primeiro acesso                      API-AUTH-003
/admin/login                    → e-mail + senha + MFA                API-AUTH-006
/admin/recuperar-senha          → "esqueci minha senha" (admin)        (sem API-ADM-* — Supabase Auth)
/admin/definir-senha            → aceitar convite / trocar senha       (sem API-ADM-* — Supabase Auth)
/admin/configurar-mfa           → cadastro de TOTP no primeiro acesso  (sem API-ADM-* — Supabase Auth)

/(colaborador)
  /painel                       → saldo, próximos plantões             API-COL-001/007
  /minha-escala                 → calendário: base + extras + ausências API-COL-002
  /plantoes                     → grade de extras, realtime            API-COL-003/004
  /plantoes-calendario          → mesma grade em calendário, chevrons navegam entre ciclos PUBLICADO API-COL-003/004/009
  /minha-escala-calendario      → escala base + extras em calendário, chevrons navegam entre ciclos PUBLICADO API-COL-002/006/009
  /minhas-extras                → marcações + pedido de cancelamento (motivo obrigatório, sem cancelar direto) API-COL-006/005

/admin
  /                             → cobertura, vagas em aberto, alertas  API-ADM-CIC-008
  /ciclos                       → competências                         API-ADM-CIC-001
  /ciclos/[id]                  → config, publicar, fechar             API-ADM-CIC-004/005/006 (leitura via GET /api/admin/ciclos?tamanho=200 filtrado por id no cliente — não existe GET /api/admin/ciclos/:id)
  /ciclos/[id]/escala           → grade editável                       API-ADM-ESC-001/002/003
  /ciclos/[id]/escala/imprimir  → A4 paisagem                          API-ADM-ESC-004
  /ciclos/[id]/plantoes         → criação em lote; edição/remoção por id digitado API-ADM-PLA-001..004 (sem GET de listagem — não há tabela de plantões existentes)
  /ciclos/[id]/participacoes    → limites, cruzada, bloqueios          API-ADM-PAR-001/002 (leitura via POST .../participacoes/lote com preview:true, somente-leitura — não há GET de listagem)
  /ciclos/[id]/marcacoes        → conferência                          API-ADM-MAR-001..003
  /solicitacoes-cancelamento    → fila de pedidos de cancelamento, aprovar/recusar API-ADM-MAR-004
  /colaboradores                → CRUD + importação                    API-ADM-COL-001..004
  /colaboradores/[id]           → dados, escala, PIN, sessões          API-ADM-COL-003/006..010 (leitura via GET /api/admin/colaboradores?tamanho=200 filtrado por id no cliente — não existe GET /api/admin/colaboradores/:id)
  /relatorios                   → consolidado                          API-ADM-REL-001/002
  /auditoria                    → trilha                               API-ADM-REL-003
  /seguranca                    → tentativas, bloqueios                API-ADM-REL-004
  /configuracoes                → CRUD de códigos de escala; RT/admin sem API dedicada (ver nota) GET /api/admin/rts, GET/POST/PATCH/DELETE /api/admin/codigos-escala
```

## Regras transversais

| ID | Regra |
|---|---|
| FE-001.1 | Guard de sessão no `layout.tsx` de cada grupo; sem sessão → redirect |
| FE-001.2 | Toda tela tem estado de carregamento, vazio e erro. Nunca tela branca |
| FE-001.3 | Mensagem de erro vem da API (`mensagem`); o cliente não inventa texto |
| FE-001.4 | `409` de regra de negócio não é toast de falha — é informação inline no lugar da ação |
| FE-001.5 | Nenhuma decisão de bloqueio é calculada no cliente; vem de `API-COL-003` |
| FE-001.6 | Ação destrutiva exige confirmação com o impacto listado |
| FE-001.7 | Acessível por teclado; contraste mínimo 4.5:1 |
| FE-001.8 | Nada de PIN em `localStorage`, `sessionStorage` ou URL |

FE-001.4 muda a sensação do produto no pico: no minuto da abertura, `SEM_VAGA` é o resultado
mais comum e esperado. Tratá-lo como erro faz o sistema parecer quebrado quando está
funcionando exatamente como deveria.

## Notas de implementação

**Primeiro acesso e recuperação de senha do admin.** `prisma/seed.ts` convida o admin
inicial via `supabase.auth.admin.inviteUserByEmail`; `/admin/definir-senha` recebe a sessão
que o SDK do Supabase estabelece a partir do link de convite/magic link (hash da URL) e
chama `auth.updateUser` para a nova senha. `/admin/configurar-mfa` cadastra o fator TOTP
exigido por `API-AUTH-006` (`auth.mfa.enroll`/`challengeAndVerify`). `/admin/recuperar-senha`
usa `resetPasswordForEmail` e redireciona para `/admin/definir-senha` (reaproveitada, não
duplicada); resposta sempre neutra quanto a existência do e-mail (`contrato-comum.md`).
Nenhuma das três rotas fica atrás de `(protected)/layout.tsx` — são pré-requisito para
autenticar.

**`/configuracoes` — CRUD de códigos de escala; RT/admin ainda sem API dedicada.**
`<CodigosEscala />` (dentro de `/configuracoes`) tem CRUD completo de `codigo_escala`: `GET`
(com `?todos=true` para incluir desativados, usado só na tela de gestão — o `<select>` de
referência usado em outras telas continua vendo só ativos), `POST` (criar, sempre
`bloqueado: false`), `PATCH`/`DELETE /:id` (editar/desativar). Os três códigos fixos (`D`,
`F`, `FE`) têm `bloqueado = true`: imutáveis exceto pela cor (`PATCH` aceita corpo contendo
**só** `cor` mesmo bloqueado; qualquer outro campo junto cai em 409). A cor só é enviada ao
confirmar no seletor (botão ✓), nunca a cada troca no `<input type="color">`. `GET` usa
`cache: 'no-store'` nesta tela (a lista de referência usada em outros lugares continua com
cache HTTP de 5 min). Sem spec de API própria dedicada (rotas em
`src/app/api/admin/codigos-escala/**`).

Ainda não existe rota em `src/app/api/admin/**` para CRUD de RT (`model Rt`) ou para contas
de admin (Supabase Auth, sem tabela própria no Prisma) — a tela mostra um aviso explicando
essa lacuna específica (FE-001.2 — nunca tela branca) e aponta onde RT já aparece hoje
(`GET /api/admin/rts`, importação de colaboradores em `API-ADM-COL-004`, grade de escala em
`API-ADM-ESC-001`).

**Referências para `<select>` em vez de UUID digitado.** `GET /api/admin/rts`,
`GET /api/admin/codigos-escala` e `GET /api/admin/ciclos/:id/plantoes` alimentam `<select>`
nas telas que antes pediam UUID em campo de texto livre: `/admin/colaboradores` (RT),
`/admin/ciclos/[id]/escala` (colaborador + código), `/admin/ciclos/[id]/marcacoes` (plantão +
colaborador), `/admin/ciclos/[id]/participacoes` (colaborador + RT),
`/admin/ciclos/[id]/plantoes` (plantão a editar/remover). Nenhuma das três rotas de
referência tem spec de API própria. Campos de texto livre genuíno (motivo, observação,
confirmação `"FECHAR"`) não são referência a ID e continuam como estavam.

**Resposta paginada é array solto, não `{itens, total}`.** `defineHandler` com
`paginacao: true` serializa o corpo como o array de itens, com o total em
`X-Total-Count` (só `GET /api/admin/ciclos` e `GET /api/admin/colaboradores` usam
`paginacao: true`; `auditoria`/`marcacoes` decidiram explicitamente não usar). O cliente
remonta o formato `{itens, total}` em `src/lib/api/client.ts` (`getLista<T>()`, lê o array +
`X-Total-Count`) e `src/lib/api/use-recurso.ts` (`useListaApi<T>`) — as páginas que consomem
listas paginadas (`/admin/ciclos`, `/admin/ciclos/[id]`, `/admin/ciclos/[id]/plantoes`,
`/admin/colaboradores`, `/admin/colaboradores/[id]`, `/admin`) usam esse hook, não
`useRecursoApi` direto no corpo cru da resposta.

**`/plantoes-calendario` e `/minha-escala-calendario` — navegação de mês por chevrons.**
`useNavegacaoCiclos` (`src/hooks/useNavegacaoCiclos.ts`, `API-COL-009`) mantém uma janela de
3 ciclos `PUBLICADO` (`anterior`/`atual`/`proximo`); ao clicar num chevron, o vizinho já
conhecido vira o `atual` na hora (sem tela de carregando) e o hook busca a janela de novo em
segundo plano para descobrir mais um passo adiante. `RASCUNHO`/`FECHADO` nunca aparecem como
vizinho. `<CalendarioPlantoesClient />` (prop `cicloInicial`) cacheia por `cicloId` os dados
de `/api/plantoes`; `<CalendarioEscalaClient />` faz o mesmo para `/api/minha-escala` +
`/api/minhas-marcacoes`. `<GoogleCalendarBotao />` continua atrelado ao ciclo do
carregamento inicial (SSR), não acompanha a navegação client-side — decisão deliberada.

**`chamarApi` envia `X-Requested-With: fetch` automaticamente.** Toda chamada de mutação
(`post`/`patch`/`put`/`del` em `src/lib/api/client.ts`) recebe esse header por padrão, exigido
por `verificarCsrf` (`API-000`) em toda rota — o chamador pode sobrescrever explicitamente, mas
não precisa mais setá-lo manualmente.
