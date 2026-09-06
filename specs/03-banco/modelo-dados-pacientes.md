# Modelo de dados — pacientes

- **ID:** DB-006
- **Status:** RASCUNHO
- **Pré-requisitos:** `01-dominio/pacientes-modelo.md`, `03-banco/modelo-dados.md`
- **Entregáveis:** adições em `prisma/schema.prisma`, migration `NNN_pacientes`

## Diagrama

```mermaid
erDiagram
    RT ||--o{ PACIENTE : "reside"
    RT ||--o{ AGENDAMENTO : "escopo"
    PACIENTE ||--o{ AGENDAMENTO : "tem"
    COLABORADOR ||--o{ AGENDAMENTO : "cria"
    COLABORADOR ||--o{ AGENDAMENTO : "acompanha"
    PACIENTE ||--o{ PRESCRICAO : "recebe"
    MEDICAMENTO ||--o{ PRESCRICAO : "referencia"
    PRESCRICAO ||--o{ ADMINISTRACAO_MEDICAMENTO : "doses"
    COLABORADOR ||--o{ ADMINISTRACAO_MEDICAMENTO : "administra"
```

## Tabelas

| Tabela | Papel | Volume estimado/ano |
|---|---|---|
| `paciente` | Residentes das RTs | ~40 |
| `agendamento` | Consultas e saídas | ~2.000 |
| `medicamento` | Catálogo de referência | ~150 |
| `prescricao` | Ordens de uso por paciente | ~300 |
| `administracao_medicamento` | Doses previstas/registradas (MAR) | ~40.000 |

## Enums novos

```
enum TipoAgendamento { CONSULTA, SAIDA }
enum StatusAgendamento { AGENDADO, CONFIRMADO, REALIZADO, CANCELADO, NAO_COMPARECEU }
enum OrigemAgendamento { COLABORADOR, ADMIN }          -- mesmo racional de OrigemMarcacao
enum StatusPaciente { ATIVO, INATIVO }
enum TipoPrescricao { REGULAR, PRN }
enum StatusPrescricao { ATIVA, SUSPENSA, ENCERRADA }
enum StatusAdministracao { PENDENTE, ADMINISTRADO, RECUSADO, ATRASADO, NAO_ADMINISTRADO }
```

## Campos por tabela (resumo — schema completo na migration)

### `paciente`
`id uuid pk`, `rt_id uuid fk→rt (restrict)`, `nome`, `data_nascimento date`, `cpf text?`,
`nome_responsavel text?`, `contato_responsavel text?`, `observacoes_clinicas text?` (restrito,
`SEC-SAUDE`), `status StatusPaciente default ATIVO`, `criado_por_id text?` (uuid `auth.users`,
sem FK — mesmo padrão de `troca_escala.criado_por_id`), `criado_em`, `atualizado_em` (trigger
`tocar_atualizado_em`, `DB-003`).

### `agendamento`
`id uuid pk`, `paciente_id uuid fk→paciente (restrict)`, `rt_id uuid fk→rt (restrict)` —
snapshot, ver `RNP-03`, `tipo TipoAgendamento`, `titulo text`, `local text?`, `inicio_em
timestamptz`, `fim_em timestamptz`, `acompanhante_colaborador_id uuid? fk→colaborador (set
null)`, `origem OrigemAgendamento`, `criado_por_colaborador_id uuid? fk→colaborador (set null)`,
`criado_por_admin_id text?` (uuid `auth.users`, sem FK), `status StatusAgendamento default
AGENDADO`, `observacoes text?`, `motivo_cancelamento text?`, `cancelado_em timestamptz?`,
`criado_em`, `atualizado_em`.

### `medicamento`
`id uuid pk`, `nome text`, `principio_ativo text?`, `ativo boolean default true`, `criado_em`.
Tabela de referência — mesmo racional de `codigo_escala` (`DOM-003`): cadastro simples, sem
deploy para adicionar item.

### `prescricao`
`id uuid pk`, `paciente_id uuid fk→paciente (restrict)`, `medicamento_id uuid fk→medicamento
(restrict)`, `tipo TipoPrescricao`, `dose text`, `via text` (oral, IM, tópica…), `horarios
text[]` (ex.: `['08:00','14:00','20:00']`; vazio quando `tipo = PRN`), `data_inicio date`,
`data_fim date?` (nulo = contínua), `prescrito_por text` (nome do médico — texto livre, não é
usuário do sistema), `instrucoes text?` (restrito, `SEC-SAUDE`), `status StatusPrescricao
default ATIVA`, `criado_por_id text?` (admin, `auth.users`), `criado_em`, `atualizado_em`.

### `administracao_medicamento`
`id uuid pk`, `prescricao_id uuid fk→prescricao (restrict)`, `colaborador_id uuid? fk→colaborador
(set null)` — quem administrou; nulo enquanto `PENDENTE`, `horario_previsto timestamptz?` (nulo
para `PRN`), `horario_administrado timestamptz?`, `status StatusAdministracao`, `observacao
text?` (obrigatório quando `PRN` ou `RECUSADO`, `RNP-17`), `criado_em`.

## Campos desnormalizados (e por quê)

| Campo | Motivo | Mitigação |
|---|---|---|
| `agendamento.rt_id` | Isolar por RT sem join até `paciente` em toda query de agenda/calendário | trigger na criação, nunca atualizado depois (`RNP-03`) |

## Chaves e cascatas

| Relação | `ON DELETE` | Motivo |
|---|---|---|
| `agendamento` → `paciente` | `RESTRICT` | histórico de agenda não se perde; paciente se inativa, não se apaga |
| `agendamento` → `rt` | `RESTRICT` | idem `plantao` → `rt` |
| `agendamento` → `colaborador` (criador/acompanhante) | `SET NULL` | colaborador pode ser desligado; agendamento permanece |
| `prescricao` → `paciente` | `RESTRICT` | histórico clínico não se perde |
| `prescricao` → `medicamento` | `RESTRICT` | item de catálogo em uso não se apaga |
| `administracao_medicamento` → `prescricao` | `RESTRICT` | MAR é o registro legal, nunca cai em cascata |
| `administracao_medicamento` → `colaborador` | `SET NULL` | mesmo racional de `agendamento` |

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| M6-1 | `prisma migrate diff` contra o schema | vazio |
| M6-2 | Toda FK nova tem `ON DELETE` explícito | sim |
| M6-3 | Toda tabela nova tem PK `uuid` e RLS habilitada (`SEC-SAUDE`) | sim |
| M6-4 | Nenhuma coluna `timestamp` sem timezone | sim |
