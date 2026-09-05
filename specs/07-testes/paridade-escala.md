# Paridade TS ↔ SQL e virada de escala

- **ID:** TST-003
- **Status:** PRONTA
- **Pré-requisitos:** `01-dominio/escala-12x36.md`, `FN-004`

Dois testes distintos, ambos bloqueando merge.

## Parte 1 — Virada de paridade

A regra que a planilha erra e o sistema existe para acertar.

| # | Âncora | Mês | Esperado |
|---|---|---|---|
| P1 | 2026-08-01 | ago/26 | 1,3,…,31 (16 dias) |
| P2 | 2026-08-01 | set/26 | 2,4,…,30 (15 dias) |
| P3 | 2026-08-01 | out/26 | 2,4,…,30 |
| P4 | 2026-08-01 | nov/26 | 1,3,…,29 |
| P5 | 2026-08-01 | dez/26 | 1,3,…,31 |
| P6 | 2028-02-01 | fev/28 | 1,3,…,29; mar começa em 2 |
| P7 | 2027-02-01 | fev/27 | 1,3,…,27; mar começa em 1 |
| P8 | 2026-08-02 | ago/26 | pares — âncora deslocada inverte tudo |
| P9 | qualquer | 24 meses seguidos | nenhum dia repetido, nenhum pulado |
| P10 | período 3 | ago/26 | a cada 3 dias |

P9 é o teste que pega erro de mod com data anterior à âncora e erro de fuso na virada de mês.

## Parte 2 — Equivalência de `validaDescanso`

`src/lib/escala/blocos.ts` (TS, usado pela UI) e `FN-004` (SQL, decisão final) devem dar o
mesmo veredito sempre. Divergência = a UI mostra disponível e a marcação recusa, ou pior,
mostra bloqueado quando estaria liberado.

**Gerador:** 1000 cenários aleatórios com semente fixa —

- 0 a 6 blocos ocupados por colaborador, distribuídos em ±3 dias
- mistura de `D`, `F`, `FT`, `FE` e extras
- bloco novo em posição aleatória (sobreposto, adjacente, distante)
- `maxBlocos` variando entre 1, 2 e 3

Cada cenário é montado no banco, avaliado pelas duas implementações, e os vereditos são
comparados. Qualquer divergência falha o build com o cenário serializado, para reprodução.

## Testes fixos de jornada

| # | Cenário | Esperado |
|---|---|---|
| J1 | Extra noturno D2, base noturno D2 | `CONFLITO_DE_HORARIO` |
| J2 | Extra diurno D2, base noturno D2 | permitido |
| J3 | Extra diurno D3, base noturno D2 | permitido |
| J4 | Base noturno D2 + diurno D2 + diurno D3 | `EXCEDE_JORNADA` |
| J5 | Dia com `FT` formando 3 blocos | `EXCEDE_JORNADA` |
| J6 | Dia com `F` | passa na jornada |
| J7 | Blocos com 1h de intervalo | não contíguos |
| J8 | `maxBlocos = 3` | 36h ok, 48h não |
