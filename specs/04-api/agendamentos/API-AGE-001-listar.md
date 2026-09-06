# API-AGE-001 — `GET /api/agendamentos`

- **ID:** API-AGE-001
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `FN-013`, `RNP-01`
- **Entregáveis:** `src/app/api/agendamentos/route.ts`

## Objetivo

Calendário de agendamentos (consultas + saídas) da **própria RT**, por período — a tela principal
deste módulo para o colaborador.

## Contrato

### Query
`?de=YYYY-MM-DD&ate=YYYY-MM-DD&tipo=CONSULTA|SAIDA` (`tipo` opcional; sem ele, ambos)

### Response 200
```ts
Array<{ id, pacienteId, pacienteNome, tipo, titulo, local, inicioEm, fimEm,
        status, acompanhanteNome }>
```

### Erros
`PERIODO_INVALIDO` 422 (`ate < de`, ou intervalo maior que 92 dias — teto para não sobrecarregar)

## Fluxo

1. `rtId` = `ator.colaborador.rtId`
2. Chamar `agenda_rt(rtId, de, ate)` (`FN-013`)

## Cache

`private, max-age=10` — calendário muda pouco entre um clique e outro, mas precisa refletir
criação recente (`API-000` "Cache", adaptado: mais curto que "referência" por ter dado que muda
no dia a dia).

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Período de 1 mês com agendamentos | lista ordenada por `inicioEm` |
| 2 | Período > 92 dias | 422 |
| 3 | `?tipo=SAIDA` | só saídas |
| 4 | Colaborador de outra RT | vê a própria agenda, nunca a de quem chamou com `tipo` igual |
