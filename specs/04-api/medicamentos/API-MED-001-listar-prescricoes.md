# API-MED-001 — `GET /api/pacientes/:pacienteId/prescricoes`

- **ID:** API-MED-001
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `01-dominio/pacientes-modelo.md`, `SEC-SAUDE`
- **Entregáveis:** `src/app/api/pacientes/[pacienteId]/prescricoes/route.ts`

## Objetivo

Lista prescrições do paciente (ativas por padrão) para a tela de medicação — colaborador precisa
saber o que dar, quando, e a dose.

## Contrato

### Query
`?status=ATIVA|SUSPENSA|ENCERRADA` (padrão: `ATIVA`)

### Response 200
```ts
Array<{ id, medicamentoNome, dose, via, tipo, horarios, dataInicio, dataFim, instrucoes, status }>
```

### Erros
`404` (paciente inexistente ou de outra RT)

## Fluxo

1. Paciente restrito à RT do ator (mesma checagem de `API-PAC-002`)
2. Filtrar prescrições por `status`

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Paciente da própria RT | lista prescrições ativas |
| 2 | Paciente de outra RT | 404 |
| 3 | `?status=ENCERRADA` | só encerradas |
