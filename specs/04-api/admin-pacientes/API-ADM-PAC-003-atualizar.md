# API-ADM-PAC-003 — `PATCH /api/admin/pacientes/:id`

- **ID:** API-ADM-PAC-003
- **Status:** RASCUNHO
- **Ator:** Admin
- **Pré-requisitos:** `API-ADM-PAC-002`
- **Entregáveis:** `src/app/api/admin/pacientes/[id]/route.ts`

## Objetivo

Atualiza cadastro, incluindo transferência de RT (`RNP-02`, `RNP-03`).

## Contrato

### Request
Subconjunto parcial dos campos de `API-ADM-PAC-002`, incluindo `rtId`.

### Response 200
Paciente atualizado.

## Fluxo

1. Carregar paciente; `404` se não existe
2. Se `rtId` mudou: `UPDATE` simples — agendamentos existentes **não** são recalculados
   (`RNP-03`, snapshot)
3. Auditar `PACIENTE_ATUALIZADO` com diff de campos (exceto `observacoesClinicas`, que audita só
   "alterado: sim/não", nunca o texto — `SEC-SAUDE`)

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Atualizar nome | 200 |
| 2 | Transferir RT | `rt_id` muda; agendamentos antigos mantêm `rt_id` anterior |
| 3 | Paciente inexistente | 404 |
| 4 | Diff de `observacoesClinicas` em auditoria | só booleano, não o texto |
