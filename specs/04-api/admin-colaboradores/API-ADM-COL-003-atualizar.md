# API-ADM-COL-003 — `PATCH /api/admin/colaboradores/:id`

- **ID:** API-ADM-COL-003
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/colaboradores/[id]/route.ts`

## Objetivo

Altera dados cadastrais, lotação ou situação. **Não** altera a âncora — isso é `API-ADM-COL-006`.

## Contrato

### Request
```ts
{ nome?, rtId?, ativo?, escalaHoraInicio?, escalaHoraFim? }
```

### Erros
`RT_COM_ESCALA_ATIVA` 409 · `IMPACTO_NAO_CONFIRMADO` 409

## Fluxo

1. Trocar RT com ciclo aberto → listar impacto nas marcações cruzadas e exigir confirmação
2. Desativar com extras futuras confirmadas → listar impacto
3. Aplicar e auditar campos alterados

## ACID

Impacto e escrita numa transação.

## CIA

**I:** trocar de RT muda retroativamente o significado de `marcacao.cruzada` das extras
já marcadas. O campo é gravado na inserção e **não** é recalculado — o registro histórico
reflete a situação no momento da marcação, que é o que a conferência de pagamento precisa.
**R:** auditoria com campos alterados, sem dados de credencial.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Alterar nome | aplicado |
| 2 | Trocar RT com marcações | impacto listado |
| 3 | `cruzada` de marcações antigas | inalterado |
| 4 | Desativar com extras futuras | impacto listado |
| 5 | Tentar alterar âncora aqui | ignorado / 422 |
