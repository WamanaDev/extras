# API-AGE-003 — `PATCH /api/agendamentos/:id`

- **ID:** API-AGE-003
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `API-AGE-002`, `RNP-09`, `RNP-12`
- **Entregáveis:** `src/app/api/agendamentos/[id]/route.ts`

## Objetivo

Edita horário, local, acompanhante ou confirma (`status = CONFIRMADO`) um agendamento existente.

## Contrato

### Request
Subconjunto parcial de `API-AGE-002`, mais `status?: 'CONFIRMADO'`.

### Response 200
Agendamento atualizado.

### Erros
`404` (outra RT ou inexistente) · `AGENDAMENTO_JA_ENCERRADO` 409 · `CONFLITO_AGENDA_PACIENTE` 409

## Fluxo

1. Carregar agendamento restrito à RT do ator; `404` se não achar
2. `RNP-09`: só quem criou, o acompanhante ou admin edita — colaborador diferente recebe `403`
   (aqui é `403`, não `404`, porque o recurso já é sabidamente visível na própria RT — a
   diferença de `API-000` é sobre existência entre RTs, não sobre esta permissão dentro da RT)
3. Bloqueado se `status IN (CANCELADO, REALIZADO, NAO_COMPARECEU)`
4. Se mudar horário e já `CONFIRMADO`: gravar valor anterior na auditoria (`RNP-12`)

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Criador edita local | 200 |
| 2 | Colega da mesma RT que não criou nem é acompanhante tenta editar | 403 |
| 3 | Editar agendamento `REALIZADO` | 409 |
| 4 | Mudar horário de agendamento `CONFIRMADO` | auditoria registra valor anterior |
| 5 | Novo horário colide com outro agendamento do paciente | 409 |
