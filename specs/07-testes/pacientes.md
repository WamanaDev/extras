# Testes — pacientes

- **ID:** TST-005
- **Status:** RASCUNHO
- **Pré-requisitos:** `07-testes/estrategia.md`, `01-dominio/regras-negocio-pacientes.md`

Segue a estratégia de `TST-001`: sem banco mockado, e toda regra de `RNP-*` precisa de um teste
que falhe se a regra for removida.

## Concorrência (análogo a `TST-002`)

| # | Cenário | Esperado |
|---|---|---|
| C-PAC-1 | 20 criações paralelas de agendamento sobreposto para o mesmo paciente | 1 sucesso, 19 `CONFLITO_AGENDA_PACIENTE` |
| C-PAC-2 | 10 registros paralelos da mesma dose prevista | 1 sucesso, 9 `DOSE_JA_REGISTRADA` |
| C-PAC-3 | Cancelar e concluir o mesmo agendamento em paralelo | um vence, outro recebe estado terminal, sem corrupção |
| C-PAC-4 | 2h de carga concorrente em `registrar_administracao` | zero deadlocks |

## Segurança (análogo a `TST-004`)

| # | Cenário | Esperado |
|---|---|---|
| S-PAC-1 | Colaborador da RT1 tentando ler/editar paciente, agendamento ou prescrição da RT2 por id direto | `404` em toda rota |
| S-PAC-2 | `anon key` lendo `paciente`/`prescricao`/`administracao_medicamento` | negado por RLS |
| S-PAC-3 | Varredura de log por `observacoesClinicas`, `dose`, `instrucoes`, `observacao` de administração | zero ocorrências |
| S-PAC-4 | Notificação push de dose/agendamento | corpo sem nome de medicamento ou motivo |
| S-PAC-5 | `app_readonly` lendo `prescricao`/`administracao_medicamento` | negado |

## Paridade (regra de negócio replicada em mais de um lugar)

| # | Cenário | Esperado |
|---|---|---|
| P-PAC-1 | Cálculo de `minutos_atraso` em `FN-014` vs. exibido em `<PainelAlertasMedicacao />` | idêntico, sem recálculo no cliente |
| P-PAC-2 | Geração de administrações `PENDENTE` na criação da prescrição vs. contagem manual (dias × horários) | idêntico |

## Cobertura de `RNP-*`

Cada regra de `01-dominio/regras-negocio-pacientes.md` tem pelo menos um teste listado acima ou
em `07-testes/pacientes.md` §Concorrência/Segurança, ou um teste de aceitação nas specs de
`03-banco/funcoes/fn-01{0..4}-*.md` e `04-api/{admin-pacientes,pacientes,agendamentos,
medicamentos}/*.md`. Não há regra sem teste referenciado.
