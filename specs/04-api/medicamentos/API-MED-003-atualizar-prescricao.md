# API-MED-003 — `PATCH /api/prescricoes/:id`

- **ID:** API-MED-003
- **Status:** RASCUNHO
- **Ator:** Colaborador (da RT do paciente) ou admin
- **Pré-requisitos:** `API-MED-002`
- **Entregáveis:** `src/app/api/prescricoes/[id]/route.ts`

## Objetivo

Ajusta dose, via ou instruções de uma prescrição ativa. **Não** permite mudar `horarios`,
`duracao`, `dataFim`, `tipo` ou `medicamentoId` de uma prescrição com administrações já geradas
— isso é suspender e criar prescrição nova (mantém o MAR histórico íntegro, `RNP-14`).

## Contrato

### Request
```ts
{ dose?: string, via?: string, instrucoes?: string }
```

### Response 200
Prescrição atualizada.

### Erros
`404` (prescrição de paciente de outra RT, para ator colaborador) · `PRESCRICAO_NAO_ATIVA` 409 ·
`CAMPO_IMUTAVEL` 422 (tentativa de mudar campo estrutural)

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Atualizar dose | 200 |
| 2 | Tentar mudar `horarios` | 422 |
| 3 | Prescrição `ENCERRADA` | 409 |
| 4 | Colaborador de outra RT | 404 |
