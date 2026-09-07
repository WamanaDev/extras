# API-COL-002 — `GET /api/minha-escala?cicloId=`

- **ID:** API-COL-002
- **Status:** PRONTA
- **Ator:** Colaborador
- **Pré-requisitos:** `01-dominio/codigos-escala.md`
- **Entregáveis:** `src/app/api/minha-escala/route.ts`

## Objetivo

Escala base do colaborador no ciclo, com códigos e extras marcadas, para o calendário pessoal.

## Contrato

### Response 200
```ts
{
  ciclo: { ano, mes },
  dias: Array<{
    data, turno, codigo, descricaoCodigo, presenca,
    horaInicio, horaFim,
    extra?: { plantaoId, rt, tipo, horaInicio, horaFim }
  }>,
  totais: { escalados: number, extras: number, horas: number }
}
```

## Autorização

Colaborador autenticado. `colaboradorId` vem **da sessão** — a rota não aceita
parâmetro de colaborador. Tentativa de ler escala de terceiro é impossível por construção,
não por verificação (`SEC-INT`).

## Fluxo

1. Ler `escala_dia` do ciclo para o ator (turno resolvido por `COALESCE(troca_escala vigente, colaborador.turno_padrao)`, mesma resolução LATERAL de `FN-002`/`FN-009`)
2. Buscar extras confirmadas do ator no ciclo em consulta **independente**, direto de `marcacao` + `plantao` + `rt` (filtro só por `colaboradorId`/`status = 'CONFIRMADA'`/`cicloId`) — **não** ancorada em `escala_dia`
3. Casar as duas por data só para preencher `dia.extra` quando o dia também tiver linha de `escala_dia`
4. Calcular totais: `totais.extras` soma direto da consulta de extras (passo 2), nunca da lista de `dias`

Extra tipicamente cai num dia de folga do colaborador, dia que pode não ter linha de `escala_dia` — um `LEFT JOIN LATERAL` ancorado em `escala_dia` deixava o dia inteiro (extra incluída) fora do resultado, e `totais.extras` saía zerado com uma extra confirmada de verdade. Por isso a consulta de extras roda solta e os totais vêm dela, não do join.

## ACID

Duas leituras (`escala_dia` e extras), não uma leitura via join único — decisão deliberada (ver Fluxo), não falta de consistência: ambas leem o mesmo ciclo/colaborador dentro da mesma requisição, sem escrita concorrente relevante entre elas.

## CIA

**C:** `escala_dia.observacao` **não** é retornada — pode conter motivo de ausência,
que é dado de saúde (`SEC-STRIDE`, I4). Retorna só o código e sua descrição.
`private, no-store`.
**D:** `private, max-age=10`; muda pouco.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Escala gerada | dias corretos pela âncora |
| 2 | Dia com `F` | código `F`, `presenca = false` |
| 3 | Dia com extra | campo `extra` preenchido |
| 4 | `observacao` no payload | ausente |
| 5 | `?colaboradorId=` de terceiro | ignorado, retorna a própria |
| 6 | Ciclo sem escala gerada | lista vazia, sem erro |
| 7 | Extra confirmada em dia sem `escala_dia` (folga) | não aparece em `dias`, mas conta em `totais.extras` |
| 8 | Extra confirmada em dia com `escala_dia` | aparece em `dia.extra` **e** conta em `totais.extras` |
