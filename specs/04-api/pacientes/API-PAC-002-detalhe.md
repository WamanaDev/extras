# API-PAC-002 — `GET /api/pacientes/:id`

- **ID:** API-PAC-002
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `API-PAC-001`
- **Entregáveis:** `src/app/api/pacientes/[id]/route.ts`

## Objetivo

Detalhe do paciente para a tela de cuidado — inclui `observacoesClinicas`, responsável e
próximos agendamentos, mas só se o paciente for da RT do colaborador.

## Contrato

### Response 200
```ts
{ id, nome, dataNascimento, nomeResponsavel, contatoResponsavel, observacoesClinicas,
  proximosAgendamentos: Array<{ id, tipo, titulo, inicioEm, status }> }
```

### Erros
`404` se o paciente não existe **ou** é de outra RT — nunca `403` (`API-000` "Erros", não vaza
existência).

## Fluxo

1. `SELECT paciente WHERE id = :id AND rt_id = ator.colaborador.rtId`
2. Sem `FOUND` → `404`
3. Anexar próximos 5 agendamentos com `status IN (AGENDADO, CONFIRMADO)`, `inicio_em >= now()`

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Paciente da própria RT | 200 com detalhe |
| 2 | Paciente de outra RT | 404 |
| 3 | Paciente inexistente | 404 (mesma resposta do caso 2) |
