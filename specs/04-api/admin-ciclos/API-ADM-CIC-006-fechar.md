# API-ADM-CIC-006 — `POST /api/admin/ciclos/:id/fechar`

- **ID:** API-ADM-CIC-006
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/integridade.md`
- **Entregáveis:** `src/app/api/admin/ciclos/[id]/fechar/route.ts`

## Objetivo

PUBLICADO → FECHADO. Congela o ciclo para efeito de conferência e pagamento.

## Contrato

### Request
```ts
{ confirmacao: 'FECHAR' }
```

### Response 200
```ts
{ ciclo, resumo: { colaboradores, extras, horas, deficits } }
```

### Erros
`TRANSICAO_INVALIDA` 409 · `CONFIRMACAO_INVALIDA` 422

## Fluxo

1. Exigir confirmação textual
2. Gerar resumo (`FN-009` + agregados)
3. `UPDATE status = 'FECHADO'`
4. Auditar `CICLO_FECHADO` com o resumo no payload
5. Broadcast

## ACID

**A:** transição + snapshot do resumo + auditoria numa transação. O resumo gravado na
auditoria é o retrato oficial do fechamento.
**I:** ciclo `FECHADO` é imutável — `FN-005` e `FN-006` recusam (RN-25).

## CIA

**I:** confirmação textual porque a operação é irreversível por API. Reabrir só por
intervenção manual auditada.
**R:** o resumo em `audit_log` é a base de conferência com a folha; é o que responde
"quantas extras o fulano fez em setembro" meses depois.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Fechamento válido | `FECHADO` + resumo |
| 2 | Confirmação errada | 422 |
| 3 | Marcar após fechar | `CICLO_FECHADO` |
| 4 | Cancelar após fechar | `CICLO_FECHADO` |
| 5 | Já fechado | `TRANSICAO_INVALIDA` |
| 6 | Resumo na auditoria | presente e correto |
