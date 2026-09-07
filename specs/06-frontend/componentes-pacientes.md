# Componentes-chave — pacientes

- **ID:** FE-004
- **Status:** RASCUNHO
- **Pré-requisitos:** `FE-002`, `06-frontend/paginas-pacientes.md`

## `<CalendarioRT />`

Calendário mensal/semanal de agendamentos da RT (`API-AGE-001`). Consulta e saída com ícone e
cor distintos, mas **sempre com o rótulo do tipo em texto** (mesmo racional de `<GradeEscala />`,
`FE-002`: nunca só cor). Clique abre detalhe; long-press/menu de contexto oferece
cancelar/confirmar/concluir conforme o status.

| Estado | Aparência |
|---|---|
| `AGENDADO` | contorno tracejado |
| `CONFIRMADO` | contorno sólido |
| `REALIZADO` | esmaecido, ícone de check |
| `CANCELADO` | riscado, oculto por padrão (toggle "mostrar cancelados") |
| `NAO_COMPARECEU` | esmaecido, ícone de alerta |

## `<FormAgendamento />`

Paciente (busca na própria RT), tipo, título, local, início/fim, acompanhante opcional. Valida
`inicio < fim` no cliente **como feedback antecipado** — a decisão final de conflito de horário
vem sempre de `CONFLITO_AGENDA_PACIENTE` da API (`FE-001.5`, `FE-003.4`).

## `<FormPrescricao />`

Cria a receita: medicamento (busca no catálogo), tipo (`REGULAR`/`PRN`), duração
(`DEFINITIVA`/`TEMPORARIA` — campo `dataFim` só aparece e só é obrigatório quando `TEMPORARIA`,
nunca os dois ao mesmo tempo, `FE-003` `VIGENCIA_INCONSISTENTE`), dose, via, horários (chips de
horário, só para `REGULAR`), prescrito por, instruções. Qualquer colaborador da RT do paciente
usa este formulário — não é tela de admin (`RNP-13`).

## `<ListaPrescricoes />`

Cartão por prescrição: medicamento, dose, via, horários (ou "conforme necessário" para PRN),
duração + vigência, status. Ação "Nova receita" abre `<FormPrescricao />`; cada dose pendente
mostra o botão da etapa disponível (`<AcaoEtapaDose />`).

## `<AcaoEtapaDose />`

Um único componente para as três etapas, trocando o botão conforme `status` da dose e conforme
quem está vendo a tela (`FE-003.6`, `FE-003.7`):

| `status` da dose | Botão visível | Para quem |
|---|---|---|
| `PENDENTE` | "Separar" | qualquer colaborador da RT |
| `SEPARADO` | "Conferir" | qualquer colaborador **exceto** `separadoPor` |
| `SEPARADO` | (somente leitura: "separado por Fulano, aguardando conferência") | o próprio `separadoPor` |
| `CONFERIDO` | "Administrar" | só `separadoPor` ou `conferidoPor` |
| `CONFERIDO` | (somente leitura: "conferido, aguardando [Fulano ou Ciclano] administrar") | demais colaboradores |
| `DIVERGENTE` | "Separar novamente" (abre nova dose) | qualquer colaborador |

"Separar" abre `<SepararMedicamento />`; "Conferir" abre `<ConferirMedicamento />`; "Administrar"
abre `<AdministrarMedicamento />`.

## `<SepararMedicamento />`

Confirmação simples (a dose e o horário previsto, ou "dose avulsa" se PRN) — separar é o ato de
preparar fisicamente, o formulário só registra quem e quando, sem campos de decisão.

## `<ConferirMedicamento />`

Modal com dois botões — "Confere" / "Não confere" — mostrando o que foi separado (medicamento,
dose, via) para o segundo colaborador comparar de fato antes de decidir. "Não confere" exige
observação (`FE-003.3`) e explica, antes de confirmar, que uma nova separação será necessária
(`RNP-28`) — não é reversível para "confere" depois.

## `<AdministrarMedicamento />`

Modal com dois botões — "Administrado" / "Recusado" — campo de observação obrigatório
(`FE-003.3`) só quando recusado. Confirmação mostra o horário exato que será gravado (`now()`),
não editável — é registro de fato, não agendamento.

## `<PainelAlertasMedicacao />`

Lista de doses paradas da RT — pendentes ou separadas sem conferência (`API-MED-007`), com
contador em badge no menu e rótulo da etapa parada. Item leva direto para `<AcaoEtapaDose />`
do paciente/dose correspondente.

## `<FilaConferencia />`

Lista de doses `SEPARADO` da RT que o colaborador logado **pode** conferir (exclui as que ele
mesmo separou, `FE-003.6`) — é o que alimenta `/conferencias`. Atualiza via `medicacao:separada`
(`RT-003`).

## `<ConfirmacaoImpacto />` (reuso)

Reaproveita o componente de `FE-002` para inativar paciente (`API-ADM-PAC-004`) e encerrar
prescrição (`API-MED-004`) — ambos cancelam/afetam registros futuros e precisam do mesmo padrão
de confirmação com impacto listado.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| FE4-1 | `CalendarioRT` sem cor (monocromático) | tipo e status ainda legíveis pelo texto/ícone |
| FE4-2 | `FormAgendamento` com fim antes do início | erro inline antes de submeter |
| FE4-3 | `FormPrescricao` com `TEMPORARIA` e `dataFim` vazio | erro inline antes de submeter |
| FE4-4 | `FormPrescricao` alternando `DEFINITIVA`↔`TEMPORARIA` | campo `dataFim` aparece/some e limpa valor anterior |
| FE4-5 | `AcaoEtapaDose` para o colaborador que separou, dose `SEPARADO` | mostra somente leitura, sem botão "Conferir" |
| FE4-6 | `ConferirMedicamento` com "Não confere" sem observação | botão de confirmar desabilitado |
| FE4-7 | `AdministrarMedicamento` recusado sem observação | botão de confirmar desabilitado |
| FE4-8 | `PainelAlertasMedicacao` com 2 pendentes + 1 separada sem conferência | badge mostra 3, cada item com etapa correta |
| FE4-9 | `FilaConferencia` de um colaborador que separou 2 das 5 doses pendentes de conferência | lista mostra só as outras 3 |
