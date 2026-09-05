# API-ADM-CIC-001 — `GET /api/admin/ciclos`

- **ID:** API-ADM-CIC-001
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/integridade.md`
- **Entregáveis:** `src/app/api/admin/ciclos/route.ts`

## Objetivo

Lista ciclos com agregados para a tela de competências.

## Contrato

### Query
`?status=&ano=&pagina=&tamanho=`

### Response 200
```ts
{ ciclos: Array<{ id, ano, mes, status, limitePadrao, permiteCruzada,
                  janela: { abertura, fechamento },
                  totais: { plantoes, vagas, ocupadas, colaboradoresComEscala } }> }
```

## Fluxo

1. Filtrar e paginar
2. Agregar contagens por ciclo em uma query com `LEFT JOIN LATERAL`

## ACID

Leitura. Agregados numa query só — duas queries poderiam mostrar números de instantes diferentes.

## CIA

**C:** só admin. **D:** paginação obrigatória; agregado usa índice `idx_plantao_ciclo_data`.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Filtro por status | só o status pedido |
| 2 | Totais | batem com contagem direta |
| 3 | Colaborador chamando | 403 |
