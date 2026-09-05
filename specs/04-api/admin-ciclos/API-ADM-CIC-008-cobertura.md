# API-ADM-CIC-008 — `GET /api/admin/ciclos/:id/cobertura`

- **ID:** API-ADM-CIC-008
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `FN-009`
- **Entregáveis:** `src/app/api/admin/ciclos/[id]/cobertura/route.ts`

## Objetivo

Dias com cobertura abaixo do mínimo por RT e turno. Responde a pergunta central da gestão.

## Contrato

### Response 200
```ts
{ dias: Array<{ data, rt, turno, escalados, extras, total, minimo, deficit }>,
  resumo: { diasComDeficit: number, deficitTotal: number } }
```

### Query
`?apenasDeficit=true`

## Fluxo

Chama `FN-009` e agrega.

## ACID

Leitura consistente numa transação — escalados e extras do mesmo instante.

## CIA

**C:** só admin. Não retorna nomes, apenas contagens — o detalhe nominal vem de
`API-ADM-ESC-001`.
**D:** consulta pesada; `private, max-age=30` e proibida durante o pico de marcação
(o role `app_readonly` com `statement_timeout` próprio atende relatórios).

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Dia completo | `deficit = 0` |
| 2 | Lançar `F` cruzando o mínimo | déficit aparece |
| 3 | Extra confirmada cobrindo | déficit volta a 0 |
| 4 | Dia com `FT` | não conta como escalado |
| 5 | `apenasDeficit` | só dias com déficit |
