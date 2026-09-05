# API-ADM-COL-001 — `GET /api/admin/colaboradores`

- **ID:** API-ADM-COL-001
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/colaboradores/route.ts`

## Objetivo

Lista colaboradores com filtros para a tela de cadastro.

## Contrato

### Query
`?rt=&ativo=&q=&pagina=&tamanho=`  — `q` busca por nome ou matrícula

### Response 200
```ts
{ colaboradores: Array<{ id, nome, matricula, rt, turnoPadrao, escalaAncora,
    escalaPeriodo, ativo, pinDefinido: boolean,
    bloqueado: boolean, sessoesAtivas: number }> }
```

## Fluxo

1. Filtrar e paginar
2. Agregar sessões ativas

## ACID

Leitura.

## CIA

**C:** nunca retorna o hash do PIN. `pinDefinido` é booleano derivado
de `pinHash IS NOT NULL` — o hash jamais sai do servidor.
Busca por matrícula é `POST /buscar` (`API-ADM-COL-005`), porque `GET ?matricula=` colocaria dado
pessoal em query string, log de proxy e histórico (`SEC-CONF`).
**D:** paginação obrigatória.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Filtro por RT | correto |
| 2 | Busca por nome parcial | correto |
| 3 | `?matricula=` na query | rejeitado por lint e em runtime |
| 4 | `pinHash` no payload | ausente |
| 5 | Colaborador chamando | 403 |
