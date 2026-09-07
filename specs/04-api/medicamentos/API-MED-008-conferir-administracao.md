# API-MED-008 — `POST /api/administracoes/:id/conferir`

- **ID:** API-MED-008
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `FN-015`, `RNP-26`, `RNP-28`
- **Entregáveis:** `src/app/api/administracoes/[id]/conferir/route.ts`

## Objetivo

2ª etapa da checagem dupla: **outro** colaborador (nunca quem separou) confere a dose contra a
prescrição.

## Contrato

### Request
```ts
{ confere: boolean, observacao?: string }   // observacao obrigatória se confere = false
```

### Response 200
Administração com `status = 'CONFERIDO'` ou `'DIVERGENTE'`.

### Erros
`404` (administração de paciente de outra RT) · `DOSE_NAO_SEPARADA` 409 ·
`CONFERENTE_IGUAL_SEPARADOR` 409 · `JUSTIFICATIVA_OBRIGATORIA` 422

## Fluxo

1. Carregar administração → prescrição → paciente → checar RT do ator; `404` se não bater
2. Chamar `conferir_medicamento` (`FN-015`) com `colaboradorId` = ator da sessão
3. Auditar `MEDICACAO_CONFERIDA` ou `MEDICACAO_DIVERGENTE` (`RNP-32`)
4. Se `DIVERGENTE`: response inclui `proximaAcao: 'nova_separacao'` para o cliente já oferecer o
   botão de separar de novo, sem navegação extra

## CIA

**I:** a rota não aceita `colaboradorId` do cliente — a checagem de "quem separou" é feita
inteiramente por comparação de sessão vs. `separado_por_id` gravado (`FN-015`), nunca por dado
que o cliente possa forjar.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Colaborador diferente confere, `confere: true` | 200, `CONFERIDO` |
| 2 | Mesmo colaborador que separou tenta conferir | 409 `CONFERENTE_IGUAL_SEPARADOR` |
| 3 | `confere: false` sem observação | 422 |
| 4 | `confere: false` com observação | 200, `DIVERGENTE` |
| 5 | Administração de paciente de outra RT | 404 |
