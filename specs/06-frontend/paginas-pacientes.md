# Páginas — pacientes

- **ID:** FE-003
- **Status:** RASCUNHO
- **Pré-requisitos:** `06-frontend/paginas.md`, `04-api/pacientes/*`, `04-api/agendamentos/*`, `04-api/medicamentos/*`

## Mapa

```
/(colaborador)
  /pacientes                        → lista da própria RT                    API-PAC-001
  /pacientes/[id]                   → detalhe, próximos agendamentos          API-PAC-002
  /pacientes/[id]/medicamentos      → prescrições + registrar administração   API-MED-001/005/006
  /agenda-rt                        → calendário mensal da RT (consultas+saídas) API-AGE-001
  /agenda-rt/novo                   → criar consulta ou saída                 API-AGE-002

/admin
  /pacientes                        → CRUD, ambas as RTs                      API-ADM-PAC-001..004
  /pacientes/[id]                   → cadastro, transferência de RT, inativar API-ADM-PAC-002..004
  /pacientes/[id]/prescricoes       → criar/editar/encerrar prescrição        API-MED-002..004
```

## Regras transversais

Herdam de `FE-001.1`–`FE-001.8`. Adições específicas:

| ID | Regra |
|---|---|
| FE-003.1 | `/agenda-rt` nunca mostra seletor de RT para colaborador — a RT é a da sessão, sem exceção (`RNP-01`) |
| FE-003.2 | Nenhuma tela deste módulo renderiza nome de medicamento ou observação clínica fora de rota autenticada — nem em título de página, nem em notificação (`SEC-SAUDE`) |
| FE-003.3 | Ação de cancelar agendamento e de registrar `RECUSADO` exige o motivo/observação **antes** de habilitar o botão de confirmar — nunca placeholder vazio submetido |
| FE-003.4 | `409` de conflito de agenda do paciente (`CONFLITO_AGENDA_PACIENTE`) mostra o agendamento conflitante inline, não só o erro |
| FE-003.5 | Tela de MAR (`/pacientes/[id]/medicamentos`) reordena doses atrasadas para o topo, com destaque não-só-cor (ícone + texto "atrasada há Xmin") |

FE-003.1 é a versão de interface de `RNP-01`: mesmo que o backend já recuse, a ausência do
controle no cliente evita que o colaborador tente e receba um `404` confuso.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| FE3-1 | Colaborador da RT1 acessa `/agenda-rt` | só vê agenda da RT1, sem seletor |
| FE3-2 | Registrar `RECUSADO` sem observação | botão de confirmar desabilitado |
| FE3-3 | Criar agendamento sobreposto | erro mostra o agendamento conflitante |
| FE3-4 | Tela de MAR com 1 dose atrasada | dose aparece no topo com destaque |
