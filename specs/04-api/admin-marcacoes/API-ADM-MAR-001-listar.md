# API-ADM-MAR-001 — `GET /api/admin/marcacoes`

- **ID:** API-ADM-MAR-001
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/marcacoes/route.ts`

## Objetivo

Lista marcações com filtros. Base da conferência do mês.

## Contrato

### Query
`?cicloId=&rt=&colaboradorId=&status=&cruzada=&de=&ate=&pagina=&tamanho=`

### Response 200
```ts
{ marcacoes: Array<{ id, colaborador: { id, nome, matricula, rt },
    plantao: { id, data, tipo, rt, horaInicio, horaFim },
    status, cruzada, origem, criadoEm, canceladoEm, canceladoPor }>,
  totais: { confirmadas, canceladas, horas, cruzadas } }
```

## Fluxo

1. Filtrar e paginar
2. Agregar totais respeitando os filtros

## ACID

Leitura consistente — lista e totais na mesma transação, senão os números não batem com as linhas exibidas.

## CIA

**C:** só admin. `ip` e `userAgent` da marcação **não** entram nesta listagem — ficam
em `API-ADM-REL-003`, para que a consulta operacional do dia a dia não exponha metadado de
rastreamento desnecessariamente.
**D:** paginação obrigatória; índice `idx_marcacao_colab`.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Filtro por ciclo | correto |
| 2 | Filtro `cruzada=true` | só cruzadas |
| 3 | Totais | batem com os filtros |
| 4 | Canceladas em `horas` | não contam |
| 5 | `ip` no payload | ausente |
