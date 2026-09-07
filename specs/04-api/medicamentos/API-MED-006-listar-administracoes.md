# API-MED-006 — `GET /api/pacientes/:pacienteId/administracoes`

- **ID:** API-MED-006
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `API-MED-001`, `RNP-30`
- **Entregáveis:** `src/app/api/pacientes/[pacienteId]/administracoes/route.ts`

## Objetivo

Histórico de MAR do paciente — o que foi dado, quando, por quem em **cada etapa**, incluindo
pendências, doses paradas em separação e atrasos. Tela principal de conferência do plantão.

## Contrato

### Query
`?de=YYYY-MM-DD&ate=YYYY-MM-DD` (padrão: hoje)

### Response 200
```ts
Array<{
  id, medicamentoNome, dose, horarioPrevisto, status,
  separadoPorNome?, separadoEm?,
  conferidoPorNome?, conferidoEm?,
  administradoPorNome?, administradoEm?,
  observacao?
}>
```

Cada etapa aparece só quando já ocorreu — uma dose ainda `PENDENTE` não tem nenhum dos campos de
etapa preenchido; uma `SEPARADO` só tem `separadoPor*`; e assim por diante (`RNP-30`).

## Fluxo

1. Paciente restrito à RT do ator (`404` senão)
2. Juntar `administracao_medicamento` de todas as prescrições do paciente no período,
   ordenado por `horario_previsto`/`criado_em`

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Dia com 3 doses regulares + 1 PRN, todas administradas | 4 linhas com as 3 etapas preenchidas |
| 2 | Dose `SEPARADO` sem conferência | só `separadoPor*` preenchido |
| 3 | Dose `DIVERGENTE` | aparece com `observacao`, sem `administradoPor*` |
| 4 | Paciente de outra RT | 404 |
