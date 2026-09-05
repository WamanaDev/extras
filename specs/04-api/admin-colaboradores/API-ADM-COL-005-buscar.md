# API-ADM-COL-005 — `POST /api/admin/colaboradores/buscar`

- **ID:** API-ADM-COL-005
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/colaboradores/buscar/route.ts`

## Objetivo

Busca exata por matrícula. É `POST` para manter o padrão de não expor identificadores
pessoais em query string, log de proxy e histórico do navegador.

## Contrato

### Request
```ts
{ matricula: string }
```

### Response 200
```ts
{ colaborador: { id, nome, matricula, rt } | null }
```

## Fluxo

1. Normalizar matrícula
2. Buscar colaborador por `matricula` (índice único)
3. Auditar `BUSCA_POR_MATRICULA`

## ACID

Leitura.

## CIA

**C:** este é o caminho padrão de busca exata por matrícula. `GET ?matricula=` exporia o dado em
log de proxy, `Referer` e histórico do navegador (`SEC-CONF`).
**R:** busca por matrícula é auditada — é o padrão de acesso mais indicativo de curiosidade
indevida sobre uma pessoa específica.
**D:** rate limit de 10/min por admin.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Matrícula existente | colaborador retornado |
| 2 | Matrícula inexistente | `null` |
| 3 | Auditoria | `BUSCA_POR_MATRICULA` registrado |
| 4 | Método `GET` com `?matricula=` | 405 |
| 5 | 11 buscas em 1 min | 429 |
