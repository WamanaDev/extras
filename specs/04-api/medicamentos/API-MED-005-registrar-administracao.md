# API-MED-005 — `POST /api/prescricoes/:id/administracoes`

- **ID:** API-MED-005
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `FN-012`, `SEC-SAUDE`
- **Entregáveis:** `src/app/api/prescricoes/[id]/administracoes/route.ts`

## Objetivo

Registra que uma dose foi dada ou recusada — o ato central do MAR. Qualquer colaborador da RT do
paciente pode chamar (papel único, `FUND-005`).

## Contrato

### Request
```ts
{ status: 'ADMINISTRADO' | 'RECUSADO',
  horarioPrevisto?: string,   // obrigatório se prescrição REGULAR; casa com uma administração PENDENTE
  observacao?: string }       // obrigatório se PRN ou RECUSADO
```

### Response 201
Administração registrada.

### Erros
`404` (prescrição de paciente de outra RT) · `PRESCRICAO_INATIVA` 409 · `FORA_DA_VIGENCIA` 409 ·
`DOSE_NAO_PREVISTA` 404 · `DOSE_JA_REGISTRADA` 409 · `JUSTIFICATIVA_OBRIGATORIA` 422

## Fluxo

1. Carregar prescrição → paciente → checar `rt_id` = RT do ator; `404` se não bater
2. Chamar `registrar_administracao` (`FN-012`) com `colaboradorId` = ator da sessão
3. Auditar `MEDICACAO_ADMINISTRADA` sem `observacao` no payload de auditoria (`SEC-SAUDE`)

## CIA

**I:** `colaboradorId` vem sempre da sessão, nunca do body — quem administrou é quem está
logado, sem exceção (`API-000` "Ator").

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Registrar dose prevista, `ADMINISTRADO` | 201 |
| 2 | Registrar `RECUSADO` sem observação | 422 |
| 3 | Registrar dose já registrada | 409 |
| 4 | Prescrição de paciente de outra RT | 404 |
| 5 | `observacao` ausente do log estruturado | confirmado |
