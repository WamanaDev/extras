# API-ADM-REL-001 — `GET /api/admin/relatorios/ciclo/:id`

- **ID:** API-ADM-REL-001
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/relatorios/ciclo/[id]/route.ts`

## Objetivo

Consolidado do ciclo: horas por colaborador, ocupação por RT, cruzadas, ausências.

## Contrato

### Response 200
```ts
{ porColaborador: Array<{ id, nome, matricula, rt, plantoesBase, extras,
    extrasCruzadas, horasBase, horasExtras, folgas, limite, aproveitamento }>,
  porRt: Array<{ rt, vagasOfertadas, vagasPreenchidas, taxaOcupacao, deficits }>,
  resumo: { colaboradores, extrasTotais, horasTotais, vagasNaoPreenchidas } }
```

## Fluxo

1. Agregar `escala_dia`, `marcacao` e `plantao` do ciclo
2. Calcular por colaborador e por RT

## ACID

Leitura numa transação; agregados de instantes diferentes não fecham.

## CIA

**D:** consulta pesada. Roda no role `app_readonly`, com `statement_timeout` próprio,
para que um relatório lento nunca compita por conexão com a marcação de extras no pico
(`SEC-DISP`, D4).
**C:** só admin. Não inclui `observacao` de ausência.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Ciclo completo | números batem com a contagem direta |
| 2 | Canceladas | não contam |
| 3 | Cruzadas | contadas separadamente |
| 4 | Ciclo com 80 colaboradores | < 3 s |
| 5 | Executa em `app_readonly` | sim |
