# API-ADM-CIC-002 — `POST /api/admin/ciclos`

- **ID:** API-ADM-CIC-002
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/integridade.md`
- **Entregáveis:** `src/app/api/admin/ciclos/route.ts`

## Objetivo

Cria a competência mensal em RASCUNHO.

## Contrato

### Request
```ts
{ ano: number, mes: number, limitePadrao: number, permiteCruzada?: boolean,
  permiteExtraEmFolga?: boolean, maxBlocosSeguidos?: number,
  aberturaMarcacao?: string, fechamentoMarcacao?: string }
```

### Response 201
O ciclo criado.

### Erros
`CICLO_JA_EXISTE` 409 · `422` de validação

## Fluxo

1. Validar (mês 1–12, limite ≥ 0, `maxBlocos` 1–3, abertura < fechamento)
2. Inserir em `RASCUNHO`
3. Auditar `CICLO_CRIADO`

## ACID

**C:** `ciclo_unico (ano, mes)` impede duplicata mesmo em requisições concorrentes;
`23505` → `CICLO_JA_EXISTE`. Não faça `SELECT` antes para "verificar se existe" — isso é
exatamente a corrida que a constraint resolve.

## CIA

**I:** `maxBlocosSeguidos > 2` é exceção formal; exige campo `justificativa`, gravado na auditoria. **C:** só admin.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Criação válida | 201 em `RASCUNHO` |
| 2 | Duplicado | `CICLO_JA_EXISTE` |
| 3 | Dois requests concorrentes | um cria, outro 409 |
| 4 | `mes = 13` | 422 |
| 5 | `maxBlocos = 3` sem justificativa | 422 |
| 6 | Abertura > fechamento | 422 |
