# API-ADM-PLA-002 — `POST /api/admin/plantoes/lote`

- **ID:** API-ADM-PLA-002
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/integridade.md`
- **Entregáveis:** `src/app/api/admin/plantoes/lote/route.ts`

## Objetivo

Gera plantões em massa: intervalo × turnos × RT × vagas. É como o mês é montado na prática.

## Contrato

### Request
```ts
{ cicloId, rtIds: string[], de, ate, tipos: ('DIURNO'|'NOTURNO')[],
  vagasTotais: number, diasSemana?: number[], permiteCruzada?: boolean | null,
  preview?: boolean }
```

### Response 200/201
```ts
{ criados: number, ignorados: Array<{ data, tipo, rt, motivo: 'JA_EXISTE' | 'FORA_DO_CICLO' }>,
  preview?: Array<{ data, tipo, rt, vagas }> }
```

## Fluxo

1. Expandir a combinação
2. `preview = true` → devolver sem gravar
3. `$transaction` com `createMany` + `skipDuplicates`
4. Auditar `PLANTAO_CRIADO_LOTE` com os parâmetros, não com 300 linhas

## ACID

**A:** tudo ou nada. Meio mês publicado seria pior que nenhum.
**C:** `skipDuplicates` apoiado no índice único; a resposta lista os ignorados.
**D:** teto de 500 plantões por chamada.

## CIA

**I:** `preview` obrigatório na UI antes de gravar — é a operação com maior potencial
de erro por descuido (marcar todos os dias em vez de dias úteis, por exemplo).
**R:** auditoria guarda os parâmetros do lote; 300 entradas individuais não contam a história.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Mês inteiro, 2 turnos, 2 RTs | 4× dias do mês |
| 2 | `preview` | nada gravado |
| 3 | Sobrepondo existentes | ignorados listados |
| 4 | Falha no meio | rollback total |
| 5 | 600 plantões | 422 |
| 6 | `diasSemana = [1..5]` | só dias úteis |
