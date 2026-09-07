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
| RNP-13 | Prescrição (temporária ou definitiva) é criada/editada por qualquer colaborador da RT do paciente, a partir da receita recebida; admin também pode, para correção ou cobertura administrativa | `API-MED-002`, `API-MED-003` |
| RNP-14 | Nenhuma etapa de administração (separação, conferência, efetivação) é editada nem apagada depois de registrada; correção é etapa/registro novo com nota | `SEC-SAUDE` |
| RNP-15 | Só se separa/confere/administra dentro da vigência da prescrição (`data_inicio`..`data_fim`) e com a prescrição `ATIVA` | `FN-012`, `FN-015`, `FN-016` |
| RNP-16 | Prescrição `REGULAR` gera uma administração `PENDENTE` por horário, para toda a vigência; `PRN` não gera nenhuma de antemão — nasce quando alguém inicia a separação | trigger na criação da prescrição |
| RNP-17 | Administração `PRN`, `RECUSADO` ou `DIVERGENTE` exige justificativa (`observacao` obrigatória) | `FN-015`, `FN-016` |
| RNP-18 | Dose não registrada até `horario_previsto + tolerância` (30 min, configurável) vira `ATRASADO` no painel, sem mudar o registro histórico até ação humana. Dose `SEPARADO` sem conferência após tolerância entra no mesmo alerta, rótulo distinto | `FN-014` |
| RNP-19 | Suspender/encerrar prescrição não apaga administrações passadas; cancela só as `PENDENTE` futuras (etapas já iniciadas — `SEPARADO`/`CONFERIDO` — seguem até o fim ou são explicitamente descartadas com nota) | `API-MED-004` |
| RNP-20 | Duas administrações não podem existir para a mesma `(prescricao_id, horario_previsto)` | unique index |

## Checagem dupla (separação, conferência, administração)

| ID | Regra | Onde vive |
|---|---|---|
| RNP-24 | Prescrição classifica `duracao`: `DEFINITIVA` (sem `data_fim`, contínua até suspensão manual) ou `TEMPORARIA` (`data_fim` obrigatório no cadastro) | `API-MED-002` |
| RNP-25 | Toda dose passa por separação → conferência → administração, nesta ordem; nenhuma etapa pula a anterior nem roda fora de ordem | `FN-012`, `FN-015`, `FN-016` |
| RNP-26 | Quem separa não pode ser quem confere a mesma dose — dois colaboradores distintos, sempre | `FN-015`, constraint |
| RNP-27 | Quem administra deve ser o separador **ou** o conferente daquela dose — nunca um terceiro colaborador que não participou da checagem | `FN-016`, constraint |
| RNP-28 | Conferência que encontra divergência marca a dose `DIVERGENTE` com observação obrigatória; a dose não é corrigida no lugar — gera nova separação, e o registro divergente permanece no histórico | `FN-015` |
| RNP-29 | PRN segue o mesmo protocolo de checagem dupla antes de administrar — não existe atalho "PRN direto" | `FN-012` |
| RNP-30 | Cada etapa grava seu próprio colaborador e horário (`separado_por_id`/`separado_em`, `conferido_por_id`/`conferido_em`, `administrado_por_id`/`administrado_em`); nenhum campo é copiado ou inferido de outra etapa | schema |
| RNP-31 | Etapa de checagem (separar/conferir/administrar) só pode ser feita por colaborador da RT do paciente, mesma regra de escopo de `RNP-01` | `API-000` |

## Auditoria e confidencialidade

| ID | Regra | Onde vive |
|---|---|---|
| RNP-21 | Toda mutação de paciente/agendamento/prescrição/administração audita dentro da transação | `SEC-AUD` (`AUD-2`) |
| RNP-22 | Condição clínica e observação de prescrição nunca aparecem em log, URL ou notificação push (só o título genérico, ex. "Você tem uma dose pendente") | `SEC-SAUDE` |
| RNP-23 | Exportação/relatório de paciente exige ator admin; colaborador não exporta dado de saúde em lote | `API-ADM-PAC-*` |
| RNP-32 | Separação, conferência e administração auditam como três eventos distintos (`MEDICACAO_SEPARADA`, `MEDICACAO_CONFERIDA`, `MEDICACAO_ADMINISTRADA`/`MEDICACAO_RECUSADA`/`MEDICACAO_DIVERGENTE`), cada um com seu próprio ator e horário — nunca um evento só no fim do ciclo | `SEC-AUD` |
