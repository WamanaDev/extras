# Escala 12x36 — cálculo por âncora

- **ID:** DOM-001
- **Status:** PRONTA
- **Pré-requisitos:** `00-fundacao/glossario.md`
- **Entregáveis:** `src/lib/escala/ancora.ts` + testes

## Regra central

O dia trabalhado **não** é armazenado. É derivado:

```
trabalha(D) ⟺ ((D − ancora) mod periodo + periodo) mod periodo == 0
```

`periodo = 2` para 12x36. O `mod` duplo trata datas anteriores à âncora, já que em muitas
linguagens (e no Postgres) `-1 % 2 == -1`.

## Por que não guardar "par/ímpar"

A paridade **vira sozinha** todo mês com número ímpar de dias:

| Mês | Dias | Padrão | Vira? |
|---|---|---|---|
| Ago/2026 | 31 | ímpares | sim → set fica par |
| Set/2026 | 30 | pares | não |
| Out/2026 | 31 | pares | sim → nov fica ímpar |
| Nov/2026 | 30 | ímpares | não |
| Fev/2028 | 29 | — | sim |

Guardar "ímpar" quebraria em janeiro, março, maio, julho, agosto, outubro, dezembro e em
fevereiro bissexto. A âncora é imune: é a mesma conta o ano inteiro.

## Validação do descanso

Noturno em D: `19:00 D` → `07:00 D+1`. Próximo em D+2: `19:00 D+2`.
Descanso = `07:00 D+1` → `19:00 D+2` = **36h**. Confere com 12x36. Idem para diurno.

## Troca de escala

Nunca se edita a âncora no lugar. Cria-se linha em `troca_escala` com `vigencia_inicio`.
A âncora aplicável a uma data é a da troca mais recente com `vigencia_inicio <= data`, ou a
âncora do cadastro se não houver troca. Escalas de meses anteriores permanecem intactas.

## Contrato do módulo

```ts
export function trabalhaEm(data: Date, ancora: Date, periodo: number): boolean;
export function diasDoMes(ancora: Date, periodo: number, ano: number, mes: number): Date[];
export function ancoraVigente(
  colaborador: { escalaAncora: Date; escalaPeriodo: number; turnoPadrao: Turno },
  trocas: TrocaEscala[],
  data: Date
): { ancora: Date; periodo: number; turno: Turno };
export function previewMeses(ancora: Date, periodo: number, ano: number, mes: number, n: number):
  Array<{ ano: number; mes: number; dias: number[]; paridade: 'PAR' | 'IMPAR' | 'MISTA' }>;
```

`paridade` é apenas rótulo de UI. Nenhuma decisão do sistema depende dela.

## Testes de aceitação

| Caso | Esperado |
|---|---|
| Âncora 2026-08-01, ago | 1,3,5,…,31 |
| Mesma âncora, set | 2,4,6,…,30 |
| Mesma âncora, out | 2,4,…,30 |
| Mesma âncora, nov | 1,3,…,29 |
| Âncora 2028-02-01, fev (bissexto) | 1,3,…,29; março começa em 2 |
| Data anterior à âncora | mod negativo tratado, sem exceção |
| Troca vigente a partir de 15/09 | dias 1–14 pela âncora antiga, 15–30 pela nova |
| `periodo = 3` | funciona sem alteração de código |
