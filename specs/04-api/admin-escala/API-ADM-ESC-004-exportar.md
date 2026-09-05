# API-ADM-ESC-004 — `GET /api/admin/ciclos/:id/escala/export`

- **ID:** API-ADM-ESC-004
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `API-ADM-ESC-001`
- **Entregáveis:** `src/app/api/admin/ciclos/[id]/escala/export/route.ts`

## Objetivo

Exporta a escala mensal para impressão (PDF A4 paisagem) ou conferência (XLSX).

## Contrato

### Query
`?formato=pdf|xlsx&rt=`

### Response 200
Binário com `Content-Disposition: attachment`.

## Fluxo

1. Reusar `API-ADM-ESC-001`
2. Renderizar PDF (A4 paisagem, quebra por RT, legenda dos códigos) ou XLSX
3. Auditar `EXPORTACAO_DADOS` com escopo, formato e nº de registros

## ACID

Leitura consistente numa transação — a escala impressa não pode misturar instantes.

## CIA

**C:** o arquivo contém nomes e ausências de todo mundo — é a exportação de maior
volume de dado pessoal do sistema, e por isso é auditada (`SEC-AUD`). `observacao` **não**
entra no PDF afixado na parede.
**I:** rodapé com data/hora de geração e id do ciclo; sem isso, versões antigas circulam
indistinguíveis.
**D:** geração pesada; `statement_timeout` maior e execução fora do pico.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | PDF de 80 colaboradores | gera, cabe em A4 paisagem |
| 2 | Legenda dos códigos | presente |
| 3 | `observacao` no PDF | ausente |
| 4 | Rodapé com data e ciclo | presente |
| 5 | Auditoria | `EXPORTACAO_DADOS` registrado |
| 6 | Impressão monocromática | códigos legíveis sem cor |
