# API-MED-009 — `POST /api/administracoes/:id/administrar`

- **ID:** API-MED-009
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `FN-016`, `RNP-27`
- **Entregáveis:** `src/app/api/administracoes/[id]/administrar/route.ts`

## Objetivo

3ª e última etapa: o separador ou o conferente (nunca um terceiro) dá a dose ao paciente ou
registra recusa.

## Contrato

### Request
```ts
{ status: 'ADMINISTRADO' | 'RECUSADO', observacao?: string }  // obrigatória se RECUSADO
```

### Response 200
Administração com `status` final.

### Erros
`404` · `DOSE_NAO_CONFERIDA` 409 · `ADMINISTRADOR_NAO_PARTICIPOU` 409 ·
`JUSTIFICATIVA_OBRIGATORIA` 422

## Fluxo

1. Carregar administração → prescrição → paciente → checar RT do ator; `404` se não bater
2. Chamar `administrar_medicamento` (`FN-016`) com `colaboradorId` = ator da sessão
3. Auditar `MEDICACAO_ADMINISTRADA` ou `MEDICACAO_RECUSADA` (`RNP-32`)

## CIA

**I:** mesma garantia de `API-MED-008` — "participou da checagem" é decidido no servidor
comparando a sessão com `separado_por_id`/`conferido_por_id`, nunca aceito do cliente.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Separador administra dose `CONFERIDO` | 200, `ADMINISTRADO` |
| 2 | Conferente administra a mesma dose | 200, `ADMINISTRADO` (em outro teste, papéis trocados) |
| 3 | Terceiro colaborador tenta administrar | 409 `ADMINISTRADOR_NAO_PARTICIPOU` |
| 4 | Administrar dose ainda `SEPARADO` | 409 `DOSE_NAO_CONFERIDA` |
| 5 | `RECUSADO` sem observação | 422 |
