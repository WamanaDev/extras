# API-MED-003 — `PATCH /api/prescricoes/:id`

- **ID:** API-MED-003
- **Status:** RASCUNHO
- **Ator:** Admin
- **Pré-requisitos:** `API-MED-002`
- **Entregáveis:** `src/app/api/prescricoes/[id]/route.ts`

## Objetivo

Ajusta dose, via ou instruções de uma prescrição ativa. **Não** permite mudar `horarios` ou
`dataFim` retroativamente sobre administrações já geradas — isso é suspender e criar prescrição
nova (mantém o MAR histórico íntegro, `RNP-14`).

## Contrato

### Request
```ts
{ dose?: string, via?: string, instrucoes?: string }
```

### Response 200
Prescrição atualizada.

### Erros
`404` · `PRESCRICAO_NAO_ATIVA` 409 · `CAMPO_IMUTAVEL` 422 (tentativa de mudar `horarios`,
`medicamentoId`, `tipo` ou `dataInicio`)

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Atualizar dose | 200 |
| 2 | Tentar mudar `horarios` | 422 |
| 3 | Prescrição `ENCERRADA` | 409 |
