# API-COL-001 — `GET /api/ciclos/atual`

- **ID:** API-COL-001
- **Status:** PRONTA
- **Ator:** Colaborador
- **Pré-requisitos:** `04-api/contrato-comum.md`
- **Entregáveis:** `src/app/api/ciclos/atual/route.ts`

## Objetivo

Devolve o ciclo publicado vigente e o estado da janela de marcação. É a primeira chamada do painel.

## Contrato

### Response 200
```ts
{
  id, ano, mes,
  janela: { abertura, fechamento, estado: 'ANTES' | 'ABERTA' | 'ENCERRADA' },
  permiteCruzada: boolean, servidorEm: string
}
```
`null` se não houver ciclo publicado.

## Autorização

Colaborador autenticado.

## Fluxo

1. Buscar ciclo `PUBLICADO` mais recente
2. Calcular `estado` da janela contra `ctx.agora`

## ACID

Leitura simples. `estado` é derivado no servidor, nunca no cliente.

## CIA

**C:** não expõe limites de terceiros nem contagem global.
**I:** `servidorEm` permite o cliente exibir contagem regressiva correta mesmo com relógio
local errado — e evita que alguém adiante o relógio para "abrir" a janela na UI. A decisão
real continua em `FN-005`.
**D:** `private, max-age=5`.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Ciclo publicado, janela aberta | `estado = 'ABERTA'` |
| 2 | Antes da abertura | `'ANTES'` |
| 3 | Após fechamento | `'ENCERRADA'` |
| 4 | Só ciclo em rascunho | `null` |
| 5 | Relógio do cliente adiantado | `estado` inalterado |
