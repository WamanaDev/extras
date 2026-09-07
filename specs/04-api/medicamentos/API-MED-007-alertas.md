# API-MED-007 — `GET /api/medicamentos/alertas`

- **ID:** API-MED-007
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `FN-014`, `RNP-01`, `RNP-18`
- **Entregáveis:** `src/app/api/medicamentos/alertas/route.ts`

## Objetivo

Lista doses paradas (pendentes ou separadas sem conferência) além da tolerância, da própria RT —
para o badge/painel do colaborador. Leitura de apoio ao job de notificação (`RT-003`), não
substitui o job (a tela precisa funcionar mesmo se a notificação falhar).

## Contrato

### Response 200
```ts
Array<{ administracaoId, pacienteId, pacienteNome, medicamentoNome, horarioPrevisto,
        etapaParada: 'PENDENTE' | 'SEPARADO', minutosAtraso }>
```

Sem nome de medicamento **fora** desta rota autenticada — a notificação push que aponta para cá
usa texto genérico (`SEC-SAUDE`, `RNP-22`); aqui, já dentro do app autenticado, o detalhe é
esperado.

## Fluxo

1. `rtId` = `ator.colaborador.rtId`
2. Chamar `alertas_medicamento(rtId, 30)` (`FN-014`)

## Cache

`private, max-age=5` — mesmo padrão de "Grade de extras" em `API-000`: dado que muda a cada
poucos minutos e precisa parecer ao vivo.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | RT com 1 dose `PENDENTE` atrasada e 1 `SEPARADO` sem conferência | 2 itens, `etapaParada` correta em cada |
| 2 | RT sem atraso | lista vazia |
| 3 | Atraso de outra RT | não aparece |
