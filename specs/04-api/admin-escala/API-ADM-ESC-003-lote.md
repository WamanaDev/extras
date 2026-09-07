# API-ADM-ESC-003 — `POST /api/admin/escala/lote`

- **ID:** API-ADM-ESC-003
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `API-ADM-ESC-002`
- **Entregáveis:** `src/app/api/admin/escala/lote/route.ts`

## Objetivo

Lança a mesma ausência num intervalo de datas — férias, licença, treinamento de vários dias.

## Contrato

### Request
```ts
{ colaboradorId: string, de: string, ate: string, codigo: string,
  observacao?: string, confirmarImpacto?: boolean }
```

### Response 200
```ts
{ alterados: number, ignorados: number,
  impacto: { extrasAfetadas: [...], diasComDeficit: [...] } }
```

## Fluxo

1. Advisory lock do colaborador, **uma vez** para o lote inteiro
2. Selecionar os `escala_dia` do intervalo (dias sem escala são ignorados, não criados)
3. Calcular impacto agregado
4. Sem confirmação e com impacto → 409
5. Quando o código novo tem `ocupaHorario = true`, revalidar a jornada de cada dia do
   intervalo contra a fonte de blocos ocupados em memória (ver "Revalidação de jornada" abaixo)
6. Auditar **uma** entrada com o intervalo, não uma por dia

## Revalidação de jornada (passo 5) — sem N+1

A revalidação por dia (`revalidarJornadaDoDia`) usa a porta `FonteBlocosOcupados`. Para um
lote, `fonteBlocosOcupadosEmMemoria` (`jornada.ts`) é usada em vez de
`fonteBlocosOcupadosPrisma`: a rota faz **uma única** consulta de `escala_dia` + **uma única**
de `marcacao` cobrindo toda a janela do lote (o maior `maxBlocosSeguidos` do lote + 1 dia de
folga — superconjunto de qualquer janela individual que `calculaJanela` pediria por dia), e o
laço de revalidação filtra esse resultado em memória por dia, em vez de fazer 2 consultas ao
Postgres por dia do intervalo. Um lote de 15 dias fazia até 30 round-trips sequenciais contra
o banco (tempo suficiente para estourar o pooler/timeout em produção, com região remota) —
agora são 2 consultas totais, independente do tamanho do lote. O critério de filtro e o
resultado são idênticos aos de consultar dia a dia.

Qualquer erro não mapeado nesta rota (`ERRO_INTERNO`) gera `console.error` no servidor
(nunca no log estruturado `LinhaLog` nem na resposta ao cliente) — sem isso, um 500 aqui não
deixava nenhum rastro para diagnosticar a causa.

## ACID

**A:** tudo ou nada. Metade das férias lançada é pior que nenhuma.
**I:** um advisory lock para o lote, não um por dia — reduz contenção e mantém a ordem de
locks previsível.
**D:** intervalo limitado a 92 dias; acima disso, 422.

## CIA

**I:** dias fora da escala base são ignorados, nunca criados. Criar linha para dia não
trabalhado inventaria plantão inexistente.
**R:** uma entrada de auditoria com o intervalo, legível meses depois — 30 entradas
idênticas escondem o que aconteceu.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Intervalo de 15 dias | só dias com escala alterados |
| 2 | Falha no meio | rollback total |
| 3 | Extras no intervalo | listadas no impacto |
| 4 | Intervalo de 200 dias | 422 |
| 5 | `de > ate` | 422 |
| 6 | Auditoria | uma entrada com o intervalo |
| 7 | Lote com código `ocupaHorario = true`, intervalo de 15 dias | sucesso, sem timeout; janela de jornada buscada em uma única consulta por tabela, não uma por dia |
