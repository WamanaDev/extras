# API-ADM-REF-002 — `/api/admin/codigos-escala`

- **ID:** API-ADM-REF-002
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `01-dominio/codigos-escala.md` (DOM-003)
- **Entregáveis:** `src/app/api/admin/codigos-escala/route.ts`, `.../[id]/route.ts` (+ `_impl.ts` em cada)

## Objetivo

CRUD dinâmico de `codigo_escala` — motivos de ausência deixam de ser fixos por seed/migration
(pedido do usuário: "Implementar configuração de motivo de ausência de forma dinâmica. Fixo
será somente D de Disponível, F de Folga e FE de Férias... pode ser incrementado outros para
uso"). Também alimenta o `<select>` de código em telas de escala (mesmo gap de referência de
`API-ADM-REF-001`).

## Contrato

### `GET /api/admin/codigos-escala`

Query: `{ todos?: 'true' | 'false' }` — sem `todos=true`, só ativos (uso em seletores). Com
`todos=true`, inclui desativados (uso da tela de gestão).

Response 200:
```ts
{ itens: Array<{
  id: string, codigo: string, descricao: string,
  presenca: boolean, ocupaHorario: boolean, remunerada: boolean,
  ativo: boolean, bloqueado: boolean, cor: string,
}> }
```

Cache: `referencia` (5 min) — mesmo em `todos=true`.

### `POST /api/admin/codigos-escala`

Request:
```ts
{ codigo: string, descricao: string, presenca: boolean, ocupaHorario: boolean, remunerada: boolean, cor: string }
```
`codigo`: 1–8 caracteres alfanuméricos, normalizado para maiúsculas. `cor`: hex `#RRGGBB`.
Corpo `.strict()` — não aceita `bloqueado` nem `ativo`; todo código criado nasce
`bloqueado: false, ativo: true` (DOM-003.6).

Response 201: o código criado (mesmo formato do `GET`).

Erro: `REGRA_DE_NEGOCIO` (409) se `codigo` já existir.

Audita `CODIGO_ESCALA_CRIADO`.

### `PATCH /api/admin/codigos-escala/:id`

Request (todos opcionais, `.strict()`):
```ts
{ descricao?: string, presenca?: boolean, ocupaHorario?: boolean, remunerada?: boolean, ativo?: boolean, cor?: string }
```

Se o código é `bloqueado` (D/F/FE): só `cor` pode estar presente no corpo — qualquer outro
campo (mesmo junto de `cor`) recusa com `REGRA_DE_NEGOCIO` (409). `bloqueado` em si nunca é
alterável por API — não existe no schema aceito.

Audita `CODIGO_ESCALA_ALTERADO` com os campos enviados.

### `DELETE /api/admin/codigos-escala/:id`

Desativa (`ativo = false`) — nunca exclui a linha (DOM-003.5, mesmo em uso). Recusa com
`REGRA_DE_NEGOCIO` (409) se `bloqueado`.

Response 200: `{ id, ativo: false }`.

Audita `CODIGO_ESCALA_DESATIVADO` com `payload.emUso` (contagem de `escala_dia` referenciando o código, informativo — não bloqueia a desativação).

## Erros
| Erro | HTTP | Quando |
|---|---|---|
| `REGRA_DE_NEGOCIO` | 409 | `codigo` duplicado; alterar/desativar código `bloqueado` fora da exceção de `cor` |
| `NAO_ENCONTRADO` | 404 | `:id` inexistente |

## Autorização

Admin autenticado em todas as rotas.

## Notas de implementação

Os handlers ficam em `_impl.ts` (fábricas `criarHandlerListar`/`criarHandlerCriar`/
`criarHandlerAtualizar`/`criarHandlerDesativar`, testáveis com Prisma fake); `route.ts` só
importa e exporta `GET`/`POST`/`PATCH`/`DELETE` — exportar as fábricas direto de `route.ts`
quebra a checagem de tipos gerada do App Router (`.next/types`).

A tela `<CodigosEscala />` (`/admin/configuracoes`) chama `GET` com `{ cache: 'no-store' }`
para recarregar após um `PATCH`/`POST`/`DELETE` — sem isso o cache HTTP de 5 min do navegador
mascarava a própria mudança que acabou de ser salva (ex.: trocar a cor de um código e não ver
refletido sem F5). O `<select>` de referência usado em outras telas continua se beneficiando
do cache padrão, intocado.

No seletor de cor da tela de gestão, `onChange` só atualiza estado local (`coresPendentes`);
o `PATCH` só é disparado ao confirmar num botão ✓ ao lado do seletor (evita disparar um
`PATCH` por evento de arrasto do `<input type="color">` nativo). Um botão ✕ descarta a
pendência sem chamar a API.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | `GET` sem `todos` | só ativos |
| 2 | `GET ?todos=true` | inclui desativados |
| 3 | `POST` código novo | 201, `bloqueado: false`, `CODIGO_ESCALA_CRIADO` |
| 4 | `POST` código duplicado | `REGRA_DE_NEGOCIO` |
| 5 | `PATCH` código não-bloqueado, várias flags | aplica tudo |
| 6 | `PATCH` código bloqueado, só `cor` | aplica |
| 7 | `PATCH` código bloqueado, `cor` + outro campo | `REGRA_DE_NEGOCIO`, nada aplicado |
| 8 | `PATCH` código bloqueado, campo que não `cor` | `REGRA_DE_NEGOCIO` |
| 9 | `DELETE` código não-bloqueado | `ativo: false` |
| 10 | `DELETE` código bloqueado | `REGRA_DE_NEGOCIO` |
