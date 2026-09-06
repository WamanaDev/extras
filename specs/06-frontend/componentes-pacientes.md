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

## `<ListaPrescricoes />`

Cartão por prescrição: medicamento, dose, via, horários (ou "conforme necessário" para PRN),
vigência, status. Ação de registrar administração abre `<RegistroAdministracao />`.

## `<RegistroAdministracao />`

Modal com dois botões primários — "Administrado" / "Recusado" — e campo de observação que vira
obrigatório (`FE-003.3`) quando: recusado, ou prescrição PRN. Confirmação mostra o horário exato
que será gravado (`now()`), não editável — é registro de fato, não agendamento.

## `<PainelAlertasMedicacao />`

Lista de doses atrasadas da RT (`API-MED-007`), com contador em badge no menu. Item leva direto
para `<RegistroAdministracao />` do paciente/dose correspondente.

## `<ConfirmacaoImpacto />` (reuso)

Reaproveita o componente de `FE-002` para inativar paciente (`API-ADM-PAC-004`) e encerrar
prescrição (`API-MED-004`) — ambos cancelam/afetam registros futuros e precisam do mesmo padrão
de confirmação com impacto listado.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| FE4-1 | `CalendarioRT` sem cor (monocromático) | tipo e status ainda legíveis pelo texto/ícone |
| FE4-2 | `FormAgendamento` com fim antes do início | erro inline antes de submeter |
| FE4-3 | `RegistroAdministracao` recusado sem observação | botão de confirmar desabilitado |
| FE4-4 | `PainelAlertasMedicacao` com 3 doses atrasadas | badge mostra 3, clique abre a dose certa |
