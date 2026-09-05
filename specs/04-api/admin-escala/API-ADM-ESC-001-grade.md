# API-ADM-ESC-001 — `GET /api/admin/ciclos/:id/escala`

- **ID:** API-ADM-ESC-001
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `01-dominio/codigos-escala.md`
- **Entregáveis:** `src/app/api/admin/ciclos/[id]/escala/route.ts`

## Objetivo

Grade completa colaboradores × dias. Base da tela de edição e da impressão.

## Contrato

### Query
`?rt=&turno=`

### Response 200
```ts
{
  ciclo: { ano, mes, dias: number },
  colaboradores: Array<{
    id, nome, matricula, rt, turnoPadrao,
    dias: Record<number, { escalaDiaId, codigo, turno, temExtra: boolean, observacao?: string }>,
    totais: { trabalhados, folgas, extras, horas }
  }>,
  codigos: Array<{ codigo, descricao, cor, presenca, ocupaHorario }>,
  coberturaPorDia: Record<number, { rt, turno, total, minimo }>
}
```

## Fluxo

1. Carregar `escala_dia` do ciclo com join de colaborador e código
2. Anexar `temExtra`
3. Montar a matriz por colaborador
4. Anexar cobertura de `FN-009`

## ACID

Uma transação de leitura. Grade e cobertura precisam ser do mesmo instante, senão a impressão sai inconsistente consigo mesma.

## CIA

**C:** `observacao` só vai no payload do admin — pode conter motivo de saúde
(`SEC-STRIDE`, I4). A rota do colaborador (`API-COL-002`) nunca a retorna.
**D:** ~80 colaboradores × 31 dias = 2.480 células. Uma query com índice
`idx_escala_ciclo`, montagem da matriz em memória. Alvo < 500 ms.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Ciclo com escala | matriz completa |
| 2 | Filtro por RT | só a RT pedida |
| 3 | Dia sem escala | ausente do mapa (não é `null`) |
| 4 | `observacao` | presente para admin |
| 5 | 80×31 | < 500 ms |
| 6 | Colaborador chamando | 403 |
