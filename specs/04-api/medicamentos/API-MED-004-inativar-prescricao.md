# API-MED-004 — `POST /api/prescricoes/:id/encerrar`

- **ID:** API-MED-004
- **Status:** RASCUNHO
- **Ator:** Admin
- **Pré-requisitos:** `API-MED-002`, `RNP-19`
- **Entregáveis:** `src/app/api/prescricoes/[id]/encerrar/route.ts`

## Objetivo

Suspende ou encerra prescrição (`RNP-19`). Diferença: `SUSPENSA` pode ser reativada pelo mesmo
registro; `ENCERRADA` é definitivo (fim de tratamento).

## Contrato

### Request
```ts
{ novoStatus: 'SUSPENSA' | 'ENCERRADA', motivo: string }
```

### Response 200
Prescrição atualizada.

## Fluxo

1. `UPDATE prescricao SET status = :novoStatus`
2. Cancelar (não apagar) todas as `administracao_medicamento` `PENDENTE` com
   `horario_previsto > now()` da prescrição — marcar `status = NAO_ADMINISTRADO`
3. Administrações passadas (já `ADMINISTRADO`/`RECUSADO`/`PENDENTE` vencida) não são tocadas
   (`RNP-19`)
4. Auditar `PRESCRICAO_ENCERRADA`/`PRESCRICAO_SUSPENSA`

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Encerrar com doses futuras `PENDENTE` | viram `NAO_ADMINISTRADO` |
| 2 | Doses passadas já administradas | não mudam |
| 3 | Sem motivo | 422 |
