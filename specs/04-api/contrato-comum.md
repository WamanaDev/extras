# Contrato comum das rotas

- **ID:** API-000
- **Status:** PRONTA — **alteração exige revisão humana**
- **Pré-requisitos:** `CONVENTIONS.md`, `02-seguranca/*`
- **Entregáveis:** `src/server/http/handler.ts`, `src/server/http/erros.ts`

Todas as specs de `04-api/` herdam daqui. Não repita o que está neste arquivo.

## Wrapper obrigatório

Toda rota é declarada por `defineHandler`, que aplica na ordem:

```
requestId → rate limit → autenticação → autorização → validação Zod
→ handler → serialização → tradução de erro → log estruturado
```

```ts
export const POST = defineHandler({
  ator: 'COLABORADOR',
  rateLimit: { escopo: 'marcacoes_por_sessao' },
  body: MarcarExtraSchema,
  handler: async ({ ator, body, ctx }) => { … },
});
```

`rateLimit` aceita só `{ escopo, identificador? }` — `escopo` é um nome já tabelado em
`02-seguranca/disponibilidade.md` (`marcacoes_por_sessao`, `leitura_por_sessao`,
`login_matricula`, etc.), com limite/janela fixados centralmente nessa tabela. Rota nenhuma
override `limite`/`janela` por parâmetro: duplicaria a tabela central. Se uma rota precisar de
um limite que não existe em nenhum escopo já nomeado, isso é lacuna de `disponibilidade.md`,
não algo que `defineHandler` deva inventar.

Handler sem `defineHandler` é erro de lint (`no-restricted-syntax`, override em
`.eslintrc.json` para `src/app/api/**/route.ts`). Isso garante que ninguém esqueça autorização
(`SEC-INT`) nem log de auditoria.

## Contexto

`ctx` traz `{ requestId, ip, userAgent, agora }`. `ip` vem de `x-forwarded-for` com o
proxy da Vercel como fonte confiável — nunca de header arbitrário do cliente.

`agora` é injetado, não `new Date()` dentro do handler: torna teste de janela determinístico.

## Ator

O ator vem **sempre** da sessão. Nenhuma rota aceita `colaboradorId` do cliente para operação
sobre si mesmo (`SEC-INT`, T2). Rotas de admin que operam sobre terceiros recebem o id no
path, e o ator continua sendo o admin da sessão.

### Resolução de sessão

`resolverSessaoPadrao` recebe o tipo de ator que a rota declara (`ator: 'PUBLICO' |
'COLABORADOR' | 'ADMIN' | 'QUALQUER'`, repassado por `defineHandler`) e tenta **primeiro** o
tipo de sessão que a rota exige, caindo para o outro tipo só quando isso faz sentido:

- `ator: 'ADMIN'` → checa a sessão Supabase (admin) primeiro; só tenta o cookie de colaborador
  se não houver sessão de admin válida.
- `ator: 'COLABORADOR'` → checa o cookie de colaborador primeiro; só tenta Supabase se não
  houver.
- `ator: 'QUALQUER'`/`'PUBLICO'` → ordem histórica, colaborador primeiro.

Isso importa quando as duas sessões existem ao mesmo tempo no mesmo navegador (comum: alguém
logado como colaborador numa aba e como admin noutra, ambos os cookies válidos no mesmo
domínio). Sem essa prioridade condicional, uma rota `ator: 'ADMIN'` com um cookie de
colaborador válido presente recebia de volta a sessão de colaborador e nunca chegava a checar
Supabase — toda rota admin caía em `403 SEM_PERMISSAO` mesmo com login de admin correto.

Sessão do colaborador: cookie `sessao_colaborador` (espelha o nome da tabela
`sessao_colaborador`), comparado via hash contra `sessao_colaborador.token_hash`
(`src/server/auth/credenciais.ts`). Sessão de admin: `@supabase/ssr` (Supabase Auth + MFA,
`00-fundacao/stack.md`), sem nome de cookie próprio — a biblioteca gerencia isso.

## Erros

Formato em `CONVENTIONS.md`. Regras adicionais:

- Erro de regra de negócio → `409` com `erro` do catálogo.
- Recurso de terceiro → `404`, nunca `403` (não vazamos existência).
- SQLSTATE traduzido centralmente por `03-banco/constraints.md`. Handler não lê SQLSTATE.
- `mensagem` é para o usuário final, em português, sem detalhe técnico.
- Nenhuma mensagem contém PIN, matrícula alheia, nome de tabela ou stack.

## Headers

Requisição: `X-Requested-With: fetch` obrigatório em mutações (CSRF, `SEC-INT`).
`Idempotency-Key` aceito em `POST /api/marcacoes`.

Resposta: `X-Request-Id` sempre. `Retry-After` em `429` e `503`.

## Cache

| Tipo | Política |
|---|---|
| Mutação | `no-store` |
| Dado pessoal (escala, saldo, marcações) | `private, no-store` |
| Grade de extras | `private, max-age=5` |
| Referência (RTs, códigos) | `private, max-age=300` |

Nada de dado pessoal em cache compartilhado. `private` sempre que a resposta variar por ator.

## Paginação

`?pagina=1&tamanho=50`, teto de 200. Resposta com `X-Total-Count`. Listas administrativas
sem paginação são erro de spec.

## Auditoria

Toda mutação chama `registrarAuditoria` **dentro** da transação (`AUD-2`). Rota de mutação
sem auditoria não passa em revisão.
