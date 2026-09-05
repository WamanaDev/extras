# API-ADM-CIC-007 — `POST /api/admin/ciclos/:id/duplicar`

- **ID:** API-ADM-CIC-007
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/integridade.md`
- **Entregáveis:** `src/app/api/admin/ciclos/[id]/duplicar/route.ts`

## Objetivo

Cria o próximo ciclo copiando a estrutura de plantões do anterior. Poupa a montagem manual.

## Contrato

### Request
```ts
{ ano: number, mes: number, copiarPlantoes?: boolean, copiarParticipacoes?: boolean }
```

### Response 201
```ts
{ ciclo, plantoesCriados: number, participacoesCriadas: number }
```

## Fluxo

1. Criar o ciclo destino em `RASCUNHO`
2. Copiar plantões mapeando por **dia do mês e turno**, descartando dias inexistentes
   (31 → mês de 30)
3. Zerar `vagasOcupadas` nos novos
4. Copiar `participacao_ciclo` se pedido, **sem** copiar `bloqueado`
5. Auditar

## ACID

**A:** `$transaction` — ciclo criado sem os plantões é pior que falhar inteiro.
**C:** `vagasOcupadas = 0` obrigatoriamente; copiar o contador do mês anterior corromperia
o novo ciclo de saída.

## CIA

**I:** `bloqueado` **não** é copiado. Bloqueio é medida pontual e temporal; arrastá-lo
para o mês seguinte puniria alguém silenciosamente por algo já resolvido.
**D:** dia 31 → mês de 30 é descartado, e o descarte volta na resposta.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Duplicar mês de 31 para mês de 30 | dia 31 descartado, informado |
| 2 | `vagasOcupadas` nos novos | zero |
| 3 | `bloqueado` | não copiado |
| 4 | Destino já existe | `CICLO_JA_EXISTE` |
| 5 | Falha no meio | rollback total |
