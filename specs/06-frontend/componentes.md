# Componentes-chave

- **ID:** FE-002
- **Status:** PRONTA
- **Pré-requisitos:** `FE-001`, `01-dominio/blocos-jornada.md`

## `<GradeEscala />`

Célula com código (`D`/`F`/`FT`/`FE`/outros cadastrados dinamicamente, `API-ADM-REF-002`) e
badge "E" (extra confirmada) quando aplicável — nunca o texto "extra" (pouco claro,
substituído). Uma legenda de códigos + "E = extra confirmada" fica sempre visível na tela,
não só na impressão.

**Agrupamento (pedido do usuário):** a grade não é mais uma matriz única colaboradores×dias.
É organizada por RT; dentro de cada RT, na ordem Ímpar Diurno → Ímpar Noturno → Par Diurno →
Par Noturno → Extras Diurno → Extras Noturno. Cada subgrupo é uma `<table>` HTML própria
(componente interno `<Subgrade />`), empilhada verticalmente — a tabela editável original
(virtualização a partir de 40 linhas + navegação por teclado) foi extraída para esse
componente interno, parametrizado por subconjunto de colaboradores.

- **Paridade** (Ímpar/Par) vem de `trabalhaEm` (`lib/escala/ancora.ts`, DOM-001) aplicada ao
  dia 1 do ciclo com a âncora/período reais do colaborador (`escalaAncora`/`escalaPeriodo`,
  vindos de `consulta.ts`) — nunca inferida a partir do código lançado nos dias 1/2, porque
  uma ausência em lote cobrindo os dias 1 e 2 (férias, licença) zeraria os dois e quebraria a
  paridade de um colaborador PAR.
- **Extras Diurno/Noturno**: seção própria, não uma coluna a mais na subgrade base. A lista
  vem de `colaborador.extras` (campo independente de `dias`, construído direto do mapa de
  marcações confirmadas) — nunca escaneando `colaborador.dias`, porque uma extra tipicamente
  cai num dia de folga do colaborador, dia que pode não ter linha de `escala_dia` nenhuma.
  Exibida como tabela colaboradores × dias (`<TabelaExtras />`), igual ao formato da grade
  base, com "E" na célula do dia coberto.
- **RT da extra**: a extra é bucketizada pela RT do **plantão coberto** (`extraRt`), não pela
  RT de origem do colaborador — numa extra cruzada (colaborador da RT-1 cobrindo plantão da
  RT-2), ela aparece só na seção "Extras" da RT-2. Isso pode criar a seção de uma RT sem
  nenhum colaborador próprio ativo no ciclo, só por causa de uma extra cruzada.
- Edição inline via dropdown → `API-ADM-ESC-002`
- Coluna de totais por colaborador; linha de cobertura por dia
- Célula com déficit destacada
- **Nunca só cor:** o texto do código está sempre presente, para daltônicos e para impressão
  monocromática
- **Larguras de coluna uniformes:** `table-layout: fixed` + `<colgroup>` com larguras em
  pixels idênticas em toda a página (`176px` colaborador, `32px` dia, `96px` totais — extras
  não tem coluna de totais). Nome de colaborador que não couber trunca em vez de esticar a
  coluna — garante que a coluna do dia N fique alinhada verticalmente entre as tabelas
  empilhadas de subgrupos diferentes.
- Cabeçalho de duas linhas: letra do dia da semana (convenção D/S/T/Q/Q/S/S) em cima do
  número do dia, igual à planilha física de referência do usuário.

## `<EscalaImpressao />`

A4 paisagem, cabeçalho com RT e competência, legenda dos códigos, rodapé com data de geração
e id do ciclo. `@media print` esconde navegação e controles (inclusive `<AdminNav>`, via
`print:hidden`). `observacao` **não** é renderizada (`SEC-CONF`).

Replica o mesmo agrupamento por RT → Ímpar/Par × Diurno/Noturno + Extras Diurno/Noturno de
`<GradeEscala />` (fonte única de paridade/agrupamento). **Cada RT sai em sua própria folha
A4** (`break-after: page` por `<section>`) — nunca todas as RTs comprimidas numa única
página. Fator de escala e legenda/rodapé são recalculados e repetidos por folha, para cada
página impressa ficar autossuficiente.

Larguras de coluna: percentuais (não pixels, ao contrário da tela) — coluna "Colaborador"
fixa em 14%, o resto dividido igualmente pelos dias do mês — para caber exatamente na largura
útil calculada da folha, com alinhamento vertical garantido entre as tabelas empilhadas de
uma mesma RT (mesmo `diasDoMes.length` em todo o print job).

`gerarPdf`/`gerarXlsx` (`API-ADM-ESC-004`) seguem o mesmo agrupamento e a mesma regra de uma
RT por folha/página; XLSX usa uma única aba por RT (colunas uniformes por natureza, não
precisou de largura explícita). PDF é texto corrido por colaborador — sem conceito de coluna
tabular, por isso não tem cabeçalho de dia da semana nem largura de coluna a igualar.

## `<GradePlantoes />`

Calendário de extras. Estados visuais:

| Estado | Aparência |
|---|---|
| Disponível | ação habilitada, vagas visíveis |
| Já marcado | destacado, com ação de cancelar |
| Lotado | esmaecido, `SEM_VAGA` |
| Bloqueado (jornada/limite/ausência) | esmaecido + tooltip com o motivo da API |
| Conflito de horário ou cruzada bloqueada | **oculto** (pedido do usuário) — ver nota |

O `motivo` vem sempre de `API-COL-003`. O componente **não** decide (`FE-001.5`) — a API
continua mandando `CRUZADA_BLOQUEADA`/`CONFLITO_DE_HORARIO` com `motivo`/`disponivel`
normalmente; `<GradePlantoes />` só escolhe, na apresentação (`MOTIVOS_OCULTOS`), não
desenhar esses dois motivos em lugar nenhum da tela (nem esmaecidos, nem em seção
explicativa separada). Os demais motivos (`SEM_VAGA`, `EM_AUSENCIA`, `EXCEDE_JORNADA`,
`LIMITE_ATINGIDO`, `JA_MARCADO`) continuam visíveis normalmente.

Revalida em segundo plano via a prop `revalidarChave` (nunca via `key`, que remontaria o
componente e limparia `dados` a cada evento de Realtime de qualquer colaborador em qualquer
máquina) — muda de valor, o componente reage num `useEffect` e refaz o fetch sem exibir o
estado de carregamento; a grade antiga fica na tela até a resposta nova chegar. Só a primeira
carga real (sem `dadosIniciais`) mostra "Carregando plantões disponíveis…". Mesmo padrão que
`<SaldoExtras />` já usava.

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
| FE-8 | `GradePlantoes` com plantões `CRUZADA_BLOQUEADA`/`CONFLITO_DE_HORARIO` | não aparecem em lugar nenhum da tela |
| FE-9 | `GradePlantoes` revalidação via `revalidarChave` | nunca desmonta/limpa `dados` |
| FE-10 | `GradeEscala`: extra cruzada (RT-1 cobre RT-2) | aparece só na seção "Extras" da RT-2 |
| FE-11 | `GradeEscala`: ausência em lote cobrindo dias 1 e 2 do ciclo | paridade continua correta (via âncora, não via código do dia) |
| FE-12 | Larguras de `<col>` entre subgrupos da mesma RT | idênticas |
