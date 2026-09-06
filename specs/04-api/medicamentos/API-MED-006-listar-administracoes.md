# API-MED-006 — `GET /api/pacientes/:pacienteId/administracoes`

- **ID:** API-MED-006
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `API-MED-001`
- **Entregáveis:** `src/app/api/pacientes/[pacienteId]/administracoes/route.ts`

## Objetivo

Histórico de MAR do paciente — o que foi dado, quando, por quem, incluindo pendências e atrasos.
Tela principal de conferência do plantão.

## Contrato

### Query
`?de=YYYY-MM-DD&ate=YYYY-MM-DD` (padrão: hoje)

### Response 200
```ts
Array<{ id, medicamentoNome, dose, horarioPrevisto, horarioAdministrado,
        status, colaboradorNome, observacao }>
```

`observacao` só aparece se preenchida por recusa/PRN — não é dado de terceiro sensível além do
já coberto por `SEC-SAUDE` (paciente da própria RT do ator).

## Fluxo

1. Paciente restrito à RT do ator (`404` senão)
2. Juntar `administracao_medicamento` de todas as prescrições do paciente no período,
   ordenado por `horario_previsto`/`horario_administrado`

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Dia com 3 doses regulares + 1 PRN | 4 linhas |
| 2 | Dose `PENDENTE` vencida | aparece com `status = PENDENTE` (rótulo `ATRASADO` calculado no cliente a partir de `FN-014`, não duplicado aqui) |
| 3 | Paciente de outra RT | 404 |
