# Páginas — pacientes

- **ID:** FE-003
- **Status:** RASCUNHO
- **Pré-requisitos:** `06-frontend/paginas.md`, `04-api/pacientes/*`, `04-api/agendamentos/*`, `04-api/medicamentos/*`

## Mapa

```
/(colaborador)
  /pacientes                        → lista da própria RT                    API-PAC-001
  /pacientes/[id]                   → detalhe, próximos agendamentos          API-PAC-002
  /pacientes/[id]/medicamentos      → prescrições + nova receita + MAR         API-MED-001..007
  /pacientes/[id]/medicamentos/nova → registrar receita (temporária/definitiva) API-MED-002
  /conferencias                     → fila de doses separadas por outros, aguardando conferência (todas as RTs do colaborador — só a própria) API-MED-006/008
  /agenda-rt                        → calendário mensal da RT (consultas+saídas) API-AGE-001
  /agenda-rt/novo                   → criar consulta ou saída                 API-AGE-002

/admin
  /pacientes                        → CRUD, ambas as RTs                      API-ADM-PAC-001..004
  /pacientes/[id]                   → cadastro, transferência de RT, inativar API-ADM-PAC-002..004
  /pacientes/[id]/prescricoes       → ver/editar/encerrar prescrição (visão administrativa, ambas as RTs) API-MED-001/003/004
```

`/pacientes/[id]/medicamentos` é a tela única de MAR: lista de prescrições, botão "Nova receita",
e para cada dose pendente/separada/conferida os botões de etapa correspondentes (`FE-004`). Não
existe tela separada para "minhas doses para conferir" versus "MAR do paciente" — é a mesma
lista, filtrada por status quando útil; `/conferencias` é um atalho de painel (visão agregada por
colaborador, não substitui a tela do paciente).

## Regras transversais

Herdam de `FE-001.1`–`FE-001.8`. Adições específicas:

| ID | Regra |
|---|---|
| FE-003.1 | `/agenda-rt` nunca mostra seletor de RT para colaborador — a RT é a da sessão, sem exceção (`RNP-01`) |
| FE-003.2 | Nenhuma tela deste módulo renderiza nome de medicamento ou observação clínica fora de rota autenticada — nem em título de página, nem em notificação (`SEC-SAUDE`) |
| FE-003.3 | Ação de cancelar agendamento e de registrar `RECUSADO` exige o motivo/observação **antes** de habilitar o botão de confirmar — nunca placeholder vazio submetido |
| FE-003.4 | `409` de conflito de agenda do paciente (`CONFLITO_AGENDA_PACIENTE`) mostra o agendamento conflitante inline, não só o erro |
| FE-003.5 | Tela de MAR (`/pacientes/[id]/medicamentos`) reordena doses atrasadas/paradas para o topo, com destaque não-só-cor (ícone + texto "atrasada há Xmin" ou "aguardando conferência há Xmin") |
| FE-003.6 | O botão de conferir nunca aparece para o próprio colaborador que separou a dose (o cliente já esconde a ação; o servidor recusa de qualquer forma, `RNP-26`) — evita o colaborador clicar e ver `409` |
| FE-003.7 | O botão de administrar só aparece para quem separou ou conferiu aquela dose específica (`RNP-27`); para os demais colaboradores da RT a dose aparece como "aguardando administração por [nome]/[nome]", somente leitura |

FE-003.1, FE-003.6 e FE-003.7 são a versão de interface das regras de escopo e checagem dupla:
mesmo que o backend já recuse, a ausência do controle no cliente evita que o colaborador tente e
receba um erro confuso em vez de entender, olhando a tela, por que a ação não está disponível.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| FE3-1 | Colaborador da RT1 acessa `/agenda-rt` | só vê agenda da RT1, sem seletor |
| FE3-2 | Registrar `RECUSADO` sem observação | botão de confirmar desabilitado |
| FE3-3 | Criar agendamento sobreposto | erro mostra o agendamento conflitante |
| FE3-4 | Tela de MAR com 1 dose atrasada | dose aparece no topo com destaque |
