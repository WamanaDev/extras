# API-ADM-REL-002 — `GET /api/admin/relatorios/ciclo/:id/export`

- **ID:** API-ADM-REL-002
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/relatorios/ciclo/[id]/export/route.ts`

## Objetivo

Exporta o consolidado em CSV ou XLSX para conferência com a folha.

## Contrato

### Query
`?formato=csv|xlsx`

### Response 200
Binário com `Content-Disposition: attachment`.

## Fluxo

1. Reusar `API-ADM-REL-001`
2. Serializar
3. Auditar `EXPORTACAO_DADOS` com escopo, formato e contagem

## ACID

Leitura consistente.

## CIA

**C:** arquivo com nome e carga horária de toda a equipe. Auditado (`SEC-AUD`) — a
exportação em massa é o caminho mais silencioso para vazamento.
**I:** cabeçalho com ciclo, data/hora de geração e id do admin, para que planilhas
circulando por e-mail sejam rastreáveis até a origem.
**D:** geração fora do pico.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | CSV | abre corretamente, separador `;` |
| 2 | XLSX | colunas tipadas |
| 3 | Auditoria | registrada |
| 4 | Cabeçalho de origem | presente |
| 5 | Dados de credencial no arquivo | ausente |
