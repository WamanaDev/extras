# API-ADM-PAC-004 — `POST /api/admin/pacientes/:id/inativar`

- **ID:** API-ADM-PAC-004
- **Status:** RASCUNHO
- **Ator:** Admin
- **Pré-requisitos:** `API-ADM-PAC-002`, `FN-011`
- **Entregáveis:** `src/app/api/admin/pacientes/[id]/inativar/route.ts`

## Objetivo

Inativa paciente (alta, transferência externa, óbito) — `UPDATE`, nunca `DELETE` (`RNP-04`).

## Contrato

### Request
```ts
{ motivo: string }
```

### Response 200
Paciente com `status = INATIVO`.

## Fluxo

1. `UPDATE paciente SET status = 'INATIVO'`
2. Cancelar (`FN-011`) todos os agendamentos futuros com `status IN (AGENDADO, CONFIRMADO)`,
   motivo = `"Paciente inativado: " || p_motivo`
3. Prescrições `ATIVA` passam a `ENCERRADA`; administrações `PENDENTE` futuras não são geradas
4. Auditar `PACIENTE_INATIVADO`

## ACID

**A:** inativação + cancelamento em cascata de agendamentos futuros na mesma transação — não
deixar agendamento futuro "órfão" de paciente inativo.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Inativar com agendamento futuro `AGENDADO` | agendamento vira `CANCELADO` |
| 2 | Inativar com agendamento passado `REALIZADO` | não é tocado |
| 3 | Inativar com prescrição `ATIVA` | prescrição vira `ENCERRADA` |
| 4 | Sem motivo | 422 |
