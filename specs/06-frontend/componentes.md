# Componentes-chave

- **ID:** FE-002
- **Status:** PRONTA
- **Pré-requisitos:** `FE-001`, `01-dominio/blocos-jornada.md`

## `<GradeEscala />`

Matriz colaboradores × dias 1–31. Célula com código (`D`/`F`/`FT`/`FE`) e badge de extra.

- Edição inline via dropdown → `API-ADM-ESC-002`
- Coluna de totais por colaborador; linha de cobertura por dia
- Célula com déficit destacada
- Virtualização a partir de 40 linhas
- **Nunca só cor:** o texto do código está sempre presente, para daltônicos e para impressão
  monocromática

## `<EscalaImpressao />`

A4 paisagem, cabeçalho com RT e competência, legenda dos códigos, quebra de página por RT,
rodapé com data de geração e id do ciclo. `@media print` esconde navegação e controles.
`observacao` **não** é renderizada (`SEC-CONF`).

## `<GradePlantoes />`

Calendário de extras. Estados visuais:

| Estado | Aparência |
|---|---|
| Disponível | ação habilitada, vagas visíveis |
| Já marcado | destacado, com ação de cancelar |
| Lotado | esmaecido, `SEM_VAGA` |
| Bloqueado | esmaecido + tooltip com o motivo da API |
| Outra RT bloqueada | seção separada, explicando a regra |

O `motivo` vem sempre de `API-COL-003`. O componente **não** decide (`FE-001.5`).

## `<SaldoExtras />`

Barra `usadas / limite`, atualizada por Realtime. Ao chegar no limite, muda o texto para
explicar que as ações estão desabilitadas por cota — não apenas desabilita em silêncio.

## `<LinhaDoTempoJornada />`

Visualiza os blocos de 12h da semana do colaborador. É o que torna `EXCEDE_JORNADA`
compreensível: ver três blocos encostados explica em um segundo o que um texto de erro não
explica em três frases.

Renderiza escala base, extras confirmadas e o bloco que seria criado, com a cadeia
excedente destacada.

## `<GeradorLote />`

Intervalo × turnos × RT × vagas, com `preview` obrigatório antes de gravar
(`API-ADM-PLA-002`). Mostra quantos serão criados e quantos serão ignorados.

## `<EditorEscalaColaborador />`

Turno, âncora e periodicidade, com **preview de 3 meses** mostrando a virada de paridade.
É a defesa contra o erro mais caro do cadastro: âncora um dia deslocada inverte todos os
plantões da pessoa, e sem o preview isso só aparece na escala impressa.

## `<ConfirmacaoImpacto />`

Modal genérico para o padrão `IMPACTO_NAO_CONFIRMADO`: lista os afetados, exige leitura e
reenvia com `confirmarImpacto: true`. Usado por `API-ADM-CIC-004`, `API-ADM-ESC-002/003`,
`API-ADM-PLA-003/004`, `API-ADM-PAR-001/002`.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| FE-1 | `GradeEscala` 80×31 | render < 1 s, scroll fluido |
| FE-2 | Célula sem cor (monocromático) | código legível |
| FE-3 | Tooltip de bloqueio | texto vindo da API |
| FE-4 | Preview de 3 meses | bate com `FN-002` |
| FE-5 | `SEM_VAGA` | inline, não toast de erro |
| FE-6 | Navegação por teclado na grade | completa |
| FE-7 | `EscalaImpressao` | 1 página por RT em A4 paisagem |
