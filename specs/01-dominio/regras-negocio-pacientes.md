# Catálogo de regras de negócio — pacientes

- **ID:** DOM-006
- **Status:** RASCUNHO
- **Pré-requisitos:** `01-dominio/pacientes-modelo.md`, `01-dominio/regras-negocio.md`

Fonte única de verdade para o módulo de pacientes. Numeração própria (`RNP-*`) para não colidir
com o catálogo existente (`RN-*`, `DOM-004`), que fica intocado. Specs de rota e de função
**referenciam** por ID; não redefinem.

## Cadastro e escopo por RT

| ID | Regra | Onde vive |
|---|---|---|
| RNP-01 | Colaborador só vê/gerencia pacientes e agendamentos da própria `rt_id`. Sem cruzada — ao contrário de `RN-19`, não existe override | RLS + `defineHandler` |
| RNP-02 | Só admin cadastra, edita e transfere (`rt_id`) paciente | `API-ADM-PAC-*` |
| RNP-03 | `agendamento.rt_id` é snapshot da RT do paciente na criação; transferência não retroage | trigger |
| RNP-04 | Inativar paciente (`INATIVO`) é `UPDATE`, nunca `DELETE`; cancela agendamentos futuros em aberto | `API-ADM-PAC-004` |

## Agendamentos (consulta e saída)

| ID | Regra | Onde vive |
|---|---|---|
| RNP-05 | Qualquer colaborador da RT do paciente pode criar agendamento | `FN-010` |
| RNP-06 | `inicio_em < fim_em`; agendamento não pode ser retroativo na criação (exceto admin registrando o ocorrido) | `FN-010` |
| RNP-07 | Dois agendamentos do mesmo paciente não podem se sobrepor no tempo | exclusion constraint |
| RNP-08 | Cancelar exige motivo (`motivo_cancelamento` obrigatório) | `API-AGE-004` |
| RNP-09 | Só quem criou, o acompanhante designado ou o admin cancela/edita | `FN-010`/`FN-011` |
| RNP-10 | Concluir (`REALIZADO`/`NAO_COMPARECEU`) só depois de `fim_em` alcançado | `API-AGE-005` |
| RNP-11 | Agendamento `CANCELADO` não bloqueia novo agendamento no mesmo horário | exclusion constraint (parcial) |
| RNP-12 | Alteração de horário depois de `CONFIRMADO` gera auditoria com o valor anterior | `API-AGE-003` |

## Medicamentos e administração

| ID | Regra | Onde vive |
|---|---|---|
| RNP-13 | Prescrição é criada/editada pelo admin; registrar administração é do colaborador | `API-MED-002`, `API-MED-005` |
| RNP-14 | Administração registrada nunca é editada nem apagada; correção é novo registro com nota | `SEC-SAUDE` |
| RNP-15 | Só se registra administração dentro da vigência da prescrição (`data_inicio`..`data_fim`) | `FN-012` |
| RNP-16 | Prescrição `REGULAR` gera uma administração `PENDENTE` por horário; `PRN` não gera nenhuma | `FN-010`-equivalente de prescrição (trigger) |
| RNP-17 | Administração `PRN` exige justificativa (`observacao` obrigatória) | `FN-012` |
| RNP-18 | Dose não registrada até `horario_previsto + tolerância` (30 min, configurável) vira `ATRASADO` no painel, sem mudar o registro histórico até ação humana | `FN-014` |
| RNP-19 | Suspender/encerrar prescrição não apaga administrações passadas; cancela só as `PENDENTE` futuras | `API-MED-004` |
| RNP-20 | Duas administrações não podem existir para a mesma `(prescricao_id, horario_previsto)` | unique index |

## Auditoria e confidencialidade

| ID | Regra | Onde vive |
|---|---|---|
| RNP-21 | Toda mutação de paciente/agendamento/prescrição/administração audita dentro da transação | `SEC-AUD` (`AUD-2`) |
| RNP-22 | Condição clínica e observação de prescrição nunca aparecem em log, URL ou notificação push (só o título genérico, ex. "Você tem uma dose pendente") | `SEC-SAUDE` |
| RNP-23 | Exportação/relatório de paciente exige ator admin; colaborador não exporta dado de saúde em lote | `API-ADM-PAC-*` |
