# API-ADM-PAR-002 — `POST /api/admin/ciclos/:id/participacoes/lote`

- **ID:** API-ADM-PAR-002
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/ciclos/[id]/participacoes/lote/route.ts`

## Objetivo

Aplica limite ou permissão de cruzada a um conjunto de colaboradores (por RT, por turno ou lista explícita).

## Contrato

### Request
```ts
{ filtro: { rtId?, turno?, colaboradorIds? },
  limiteOverride?: number | null, permiteCruzada?: boolean | null,
  motivo: string, preview?: boolean, confirmarImpacto?: boolean }
```

### Response 200
```ts
{ afetados: number, impacto: Array<{ colaboradorId, nome, usadas, novoLimite }> }
```

## Fluxo

1. Resolver o filtro
2. `preview` → devolver sem gravar
3. Impacto agregado; sem confirmação → 409
4. Advisory locks em ordem crescente de id
5. `upsert` em massa e auditoria única com filtro e contagem

## ACID

**A:** tudo ou nada.
**I:** locks em ordem crescente de id — mesma disciplina de `API-ADM-PLA-003`. Sem ordem
fixa, dois lotes concorrentes com interseção formam deadlock.
**D:** teto de 200 colaboradores por chamada.

## CIA

**I:** `preview` obrigatório na UI. Aplicar limite errado a 80 pessoas de uma vez é o
tipo de erro que só se descobre quando alguém reclama.
**R:** uma entrada de auditoria com filtro e contagem, mais uma linha por colaborador
afetado no payload.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Filtro por RT | só a RT |
| 2 | `preview` | nada gravado |
| 3 | Alguém acima do novo limite | impacto listado |
| 4 | Falha no meio | rollback total |
| 5 | Dois lotes concorrentes com interseção | sem deadlock |
| 6 | 300 colaboradores | 422 |
