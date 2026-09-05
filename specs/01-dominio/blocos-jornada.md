# Blocos de jornada e regra de descanso

- **ID:** DOM-002
- **Status:** PRONTA
- **Pré-requisitos:** `01-dominio/escala-12x36.md`
- **Entregáveis:** `src/lib/escala/blocos.ts`, `src/server/services/jornada.ts` + testes

## Modelagem

Todo compromisso vira um intervalo semiaberto `[inicio, fim)` em `timestamptz`:

| Turno | Início | Fim |
|---|---|---|
| DIURNO em D | `D 07:00` | `D 19:00` |
| NOTURNO em D | `D 19:00` | `D+1 07:00` |

Semiaberto é essencial: `[07,19)` e `[19,07+1)` são **contíguos, não sobrepostos**.
Com intervalo fechado, todo turno colidiria com o seguinte.

## As três regras, unificadas

Toda a exigência do negócio se reduz a duas verificações sobre intervalos:

**1. Sobreposição → `CONFLITO_DE_HORARIO`.**
Cobre "não pode pegar extra no mesmo dia e mesmo turno do próprio plantão".
Não é preciso comparar data e turno: se os intervalos se cruzam, recusa.

**2. Cadeia contígua > `maxBlocosSeguidos` (padrão 2) → `EXCEDE_JORNADA`.**
Cobre "não pode 36h seguidas". Também deixa passar o que deve passar:

```
D2 diurno  [07→19] + D2 noturno [19→07]            = 2 blocos, 24h → OK
D2 noturno [19→07] + D3 diurno  [07→19]            = 2 blocos, 24h → OK
D2 diurno + D2 noturno + D3 diurno                 = 3 blocos, 36h → BLOQUEIA
```

## O que entra na conta

Fonte dos blocos ocupados de um colaborador:

- `escala_dia` cujo código tem `presenca = true` **ou** `ocupa_horario = true`
- `marcacao` com `status = 'CONFIRMADA'`, pelo intervalo do `plantao`

A distinção importa: `FT` (folga treinamento) e `FE` (folga TRE) têm `presenca = false` mas
`ocupa_horario = true`. A pessoa não cobre o plantão, mas também **não está descansando**.
Só `F` libera o horário de fato.

## Algoritmo

Não faça loop de queries. Carregue a janela `[inicio − 36h, fim + 36h]` de uma vez,
ordene por `inicio`, e percorra:

```ts
export function validaDescanso(
  blocos: Bloco[],        // já ordenados, da janela
  novo: Bloco,
  maxBlocos: number
): 'CONFLITO_DE_HORARIO' | 'EXCEDE_JORNADA' | null {
  for (const b of blocos) if (b.inicio < novo.fim && b.fim > novo.inicio) return 'CONFLITO_DE_HORARIO';

  const todos = [...blocos, novo].sort((a, b) => +a.inicio - +b.inicio);
  let corrida = 1;
  for (let i = 1; i < todos.length; i++) {
    corrida = +todos[i].inicio === +todos[i - 1].fim ? corrida + 1 : 1;
    if (corrida > maxBlocos) return 'EXCEDE_JORNADA';
  }
  return null;
}
```

Janela de ±36h é suficiente: com blocos de 12h, uma cadeia de 3 cabe em 36h. Se
`maxBlocosSeguidos` subir para 3, a janela precisa subir para 48h — o valor é derivado de
`(maxBlocos + 1) * 12h`, não constante mágica.

## Espelho no banco

Esta função existe **duas vezes**: em TS (para a UI antecipar o bloqueio) e em PL/pgSQL
(`FN-004`, decisão final). Divergência entre as duas é bug de severidade alta.
`07-testes/paridade-escala.md` define o teste de equivalência que roda as duas com os mesmos
1000 cenários gerados e compara.

## Testes de aceitação

| Cenário | Esperado |
|---|---|
| Extra noturno D2, base noturno D2 | `CONFLITO_DE_HORARIO` |
| Extra diurno D2, base noturno D2 | permitido |
| Extra diurno D3, base noturno D2 | permitido |
| Extra diurno D3, base noturno D2 + extra diurno D2 | `EXCEDE_JORNADA` |
| Extra em dia com `FT` | `EXCEDE_JORNADA` |
| Extra em dia com `F` | passa na jornada (bloqueio, se houver, vem de `EM_AUSENCIA`) |
| Blocos com 1h de intervalo | não são contíguos, não somam cadeia |
| 1000 cenários aleatórios TS vs SQL | veredito idêntico |
