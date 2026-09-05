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

1. Ler `escala_dia` do ciclo para o ator
2. Anexar marcações confirmadas por data
3. Calcular totais

## ACID

Leitura consistente: uma query com join, não duas chamadas que possam ver estados diferentes.

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
