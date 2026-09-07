# Visão geral — Módulo de cuidados com pacientes

- **ID:** FUND-005
- **Status:** RASCUNHO
- **Pré-requisitos:** `00-fundacao/visao-geral.md`, `00-fundacao/glossario.md`
- **Entregáveis:** nenhum (documento de contexto)

## Problema

RT1 e RT2 são residências terapêuticas: além de escalar colaboradores, cada unidade cuida de
pacientes residentes. Hoje consultas, saídas e medicação são controladas em papel/planilha por
RT, sem histórico consultável nem alerta de horário. Três problemas concretos:

1. **Consulta ou saída esquecida.** Sem agenda compartilhada, o colaborador do plantão seguinte
   não sabe que o paciente tem consulta às 14h e precisa estar pronto/acompanhado.
2. **Medicação sem rastro.** Não há registro de quem administrou o quê e quando; dose atrasada
   ou duplicada não é detectada até o dano ocorrer.
3. **Mistura entre unidades.** Paciente e agenda de uma RT não podem vazar para quem trabalha na
   outra — hoje isso depende de disciplina manual, não de controle de sistema.

## Escopo

**Dentro:** cadastro de paciente pelo admin; colaborador da RT do paciente cria e gerencia
agendamentos (consulta e saída); colaborador registra receitas/prescrições (medicamento
temporário ou definitivo) e opera o ciclo de administração com **checagem dupla** — um
colaborador separa a dose, outro confere, e só então um dos dois (nunca um terceiro) ministra;
calendário de agenda por RT; alertas de dose pendente/atrasada/parada em separação; auditoria de
cada etapa.

**Fora (por ora):** prontuário eletrônico completo, prescrição eletrônica assinada por médico
externo ao sistema, faturamento de convênio, integração com farmácia, telemedicina.

## Atores

| Ator | Pode |
|---|---|
| Administrador | Cadastrar/editar/inativar paciente, transferir entre RTs, gerenciar catálogo de medicamentos (referência), ver tudo em ambas as RTs; pode também registrar/editar prescrição e conduzir a checagem dupla, para correção ou cobertura administrativa |
| Colaborador | Ver pacientes e agenda **só da própria RT** (`RNP-01`); criar/editar/cancelar agendamento (consulta e saída); registrar receita/prescrição (temporária ou definitiva); separar, conferir e administrar medicamento |
| Sistema | Alertas de dose pendente/atrasada/parada em separação, lembrete de agendamento próximo |

Não há papel clínico diferenciado nesta primeira versão — qualquer colaborador lotado na RT do
paciente pode agendar, registrar saída, lançar prescrição e participar da checagem dupla
(decisão de produto; revisar se o volume de erro justificar segregação de função no futuro).
A segurança da administração de medicamento **não** depende de papel diferenciado — depende de
**duas pessoas distintas** em separação e conferência (`RNP-26`), o que vale com papel único.

## Separação por RT

Paciente pertence a exatamente uma RT (`paciente.rt_id`). Agendamento herda a RT do paciente no
momento da criação. Colaborador só enxerga pacientes e agendamentos da sua própria lotação —
**sem exceção "cruzada"**, ao contrário do módulo de extras (`RN-19`/`RN-20`). Cuidado com
paciente é sempre local à unidade; não existe cenário de negócio para atendimento cruzado.

## Dado sensível

Nome, data de nascimento, condição clínica, medicação e agenda de saúde de paciente são **dado
sensível** (LGPD art. 5º, II — dado de saúde). Ver `02-seguranca/dados-sensiveis-saude.md`
(`SEC-SAUDE`) antes de tocar qualquer spec deste módulo que grave ou exiba esses campos.

## Restrições não-funcionais

| Requisito | Alvo |
|---|---|
| Latência p95 da agenda por RT (período de 1 mês) | < 500 ms |
| Alerta de dose atrasada | gerado em até 5 min do horário previsto |
| Retenção de registro de administração de medicamento | 20 anos (guarda de prontuário, `SEC-SAUDE`) |
| Disponibilidade | mesma janela de `FUND-001` |
