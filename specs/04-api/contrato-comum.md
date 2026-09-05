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
  rateLimit: { escopo: 'sessao', limite: 10, janela: '1m' },
  body: MarcarExtraSchema,
  handler: async ({ ator, body, ctx }) => { … },
});
```

Handler sem `defineHandler` é erro de lint. Isso garante que ninguém esqueça autorização
(`SEC-INT`) nem log de auditoria.

## Contexto

`ctx` traz `{ requestId, ip, userAgent, agora }`. `ip` vem de `x-forwarded-for` com o
proxy da Vercel como fonte confiável — nunca de header arbitrário do cliente.

`agora` é injetado, não `new Date()` dentro do handler: torna teste de janela determinístico.

## Ator

O ator vem **sempre** da sessão. Nenhuma rota aceita `colaboradorId` do cliente para operação
sobre si mesmo (`SEC-INT`, T2). Rotas de admin que operam sobre terceiros recebem o id no
path, e o ator continua sendo o admin da sessão.

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
