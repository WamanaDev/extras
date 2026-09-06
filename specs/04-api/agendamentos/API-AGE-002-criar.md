# API-AGE-002 — `POST /api/agendamentos`

- **ID:** API-AGE-002
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `FN-010`, `RNP-01`, `RNP-05`, `RNP-06`
- **Entregáveis:** `src/app/api/agendamentos/route.ts`

## Objetivo

Cria consulta ou saída para um paciente da própria RT. É o "incrementar agendamento" do
colaborador citado no escopo do módulo.

## Contrato

### Request
```ts
{ pacienteId, tipo: 'CONSULTA' | 'SAIDA', titulo, local?: string,
  inicioEm: string, fimEm: string, acompanhanteColaboradorId?: string, observacoes?: string }
```

### Response 201
Agendamento criado, `origem = 'COLABORADOR'`.

### Erros
`PACIENTE_INDISPONIVEL` 409 · `INTERVALO_INVALIDO` 422 · `AGENDAMENTO_RETROATIVO` 409 ·
`CONFLITO_AGENDA_PACIENTE` 409

## Fluxo

1. Carregar paciente por `pacienteId`; se `rt_id` ≠ RT do ator → `404` (não vaza paciente de
   outra unidade, `API-000` "Erros")
2. Chamar `criar_agendamento` (`FN-010`) com `origem = 'COLABORADOR'`,
   `criadoPorColaboradorId` = ator da sessão
3. Auditar `AGENDAMENTO_CRIADO`

## CIA

**C:** passo 1 é o que impede um colaborador de agendar para paciente de outra RT mesmo
adivinhando o `id` — `FN-010` não checa RT do ator, só confia no que a rota já validou.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Consulta válida | 201 |
| 2 | Saída válida | 201 |
| 3 | `pacienteId` de outra RT | 404 |
| 4 | Horário sobreposto a outro agendamento do mesmo paciente | 409 `CONFLITO_AGENDA_PACIENTE` |
| 5 | `inicioEm` no passado | 409 `AGENDAMENTO_RETROATIVO` |
