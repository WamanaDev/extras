# API-ADM-PAC-001 — `GET /api/admin/pacientes`

- **ID:** API-ADM-PAC-001
- **Status:** RASCUNHO
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `01-dominio/pacientes-modelo.md`
- **Entregáveis:** `src/app/api/admin/pacientes/route.ts`

## Objetivo

Lista pacientes de ambas as RTs, com filtro. Único ponto do sistema que enxerga as duas unidades
ao mesmo tempo para paciente (`RNP-01` é regra do colaborador, não do admin).

## Contrato

### Query
`?rtId=&status=&busca=&pagina=1&tamanho=50` (`API-000` "Paginação")

### Response 200
```ts
{ itens: Array<{ id, nome, dataNascimento, rtId, rtNome, status }>, total: number }
```

## Fluxo

1. Filtrar por `rtId`/`status` se informados; `busca` faz `ILIKE` em `nome`
2. Paginar (`X-Total-Count`)

## CIA

**C:** nome completo e data de nascimento só aparecem para admin — mesma lista para colaborador
(`API-PAC-001`) omite data de nascimento e mostra só a própria RT.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Sem filtro | pacientes de ambas as RTs |
| 2 | `?rtId=` | só da RT pedida |
| 3 | `?status=INATIVO` | só inativos |
| 4 | Paginação | `X-Total-Count` correto |
