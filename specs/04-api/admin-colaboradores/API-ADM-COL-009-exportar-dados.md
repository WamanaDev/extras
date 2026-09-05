# API-ADM-COL-009 — `GET /api/admin/colaboradores/:id/exportar-dados`

- **ID:** API-ADM-COL-009
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/colaboradores/[id]/exportar-dados/route.ts`

## Objetivo

Atende pedido de acesso do titular (LGPD art. 18). Exporta tudo que o sistema guarda sobre a pessoa.

## Contrato

### Query
`?formato=json|pdf`

### Response 200
```ts
{ cadastro, escalas: [...], marcacoes: [...], trocasEscala: [...],
  acessos: [...], geradoEm, observacaoRetencao: string }
```

## Fluxo

1. Reunir todos os registros do titular
2. Incluir aviso de retenção legal
3. Auditar `EXPORTACAO_DADOS` com escopo e contagem

## ACID

Leitura numa transação — o pacote precisa ser um retrato coerente.

## CIA

**C:** não inclui `pinHash` — hash de credencial não é dado que o titular
precise, e exportá-lo cria uma cópia fora do banco.
**I:** `observacaoRetencao` explicita que exclusão é limitada pela guarda trabalhista de
5 anos após desligamento. Negar sem explicar é o que gera reclamação na ANPD; explicar a base
legal é a resposta correta.
**R:** exportação auditada — é uma das operações de maior risco de vazamento.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Exportação | todos os registros do titular |
| 2 | Hashes de credencial | ausentes |
| 3 | Dados de terceiros | ausentes |
| 4 | Aviso de retenção | presente |
| 5 | Auditoria | `EXPORTACAO_DADOS` |
