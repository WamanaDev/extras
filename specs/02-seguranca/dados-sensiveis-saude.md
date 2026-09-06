# Dados sensíveis de saúde

- **ID:** SEC-SAUDE
- **Status:** RASCUNHO — **alteração exige revisão humana**
- **Pré-requisitos:** `02-seguranca/confidencialidade.md`, `01-dominio/pacientes-modelo.md`
- **Entregáveis:** políticas RLS de `paciente`/`prescricao`/`administracao_medicamento`, redator de log

## Por que este documento existe

`02-seguranca/confidencialidade.md` (`SEC-CONF`) classifica dado de colaborador. Dado de
**paciente** é categoria diferente na LGPD — art. 5º, II classifica dado de saúde como **dado
pessoal sensível**, com tratamento mais restrito que dado trabalhista comum (art. 11). Este
documento é `SEC-CONF` aplicado a essa categoria; não a substitui.

## Classificação

| Nível | Dados | Quem acessa |
|---|---|---|
| **Sensível — saúde** | condição clínica, `prescricao`, `administracao_medicamento`, `paciente.observacoes_clinicas` | Admin + colaborador **da RT do paciente** |
| **Sensível — identificação** | `paciente.nome`, `data_nascimento`, `cpf` (se houver), contato do responsável | Admin + colaborador da RT do paciente |
| **Interno** | `agendamento` (título, horário, status) | Admin + colaborador da RT do paciente |
| **Restrito** | motivo de cancelamento, observação de agendamento | idem interno, mas nunca em notificação push (`RNP-22`) |

Diferente do colaborador (dado trabalhista, base legal em contrato de trabalho), dado de
paciente usa base legal de **tutela da saúde** (LGPD art. 11, II, "f") e **proteção da vida**
(art. 11, II, "d") quando aplicável — não é execução de contrato. Isso muda o que o titular (ou
responsável legal) pode pedir: acesso e correção seguem valendo; anonimização irrestrita não,
enquanto o paciente estiver sob cuidado ativo.

## Least privilege

Mesmas três roles de `SEC-CONF`. Nenhuma nova role. Regras adicionais:

```sql
REVOKE DELETE ON paciente, agendamento, prescricao, administracao_medicamento FROM app_server;
-- inativação/cancelamento é UPDATE de status, nunca DELETE — mesmo racional de marcacao.
```

`app_readonly` (relatórios/BI) **não** tem `SELECT` em `prescricao` nem `administracao_medicamento`
por padrão — dado de saúde não entra em BI genérico sem anonimização explícita e aprovação
separada. Se um relatório precisar, ele é uma view materializada com paciente pseudonimizado,
não acesso direto à tabela.

## RLS — princípio

Mesma base de `02-seguranca/rls-policies.md`: `ENABLE` + `FORCE ROW LEVEL SECURITY` em todas as
tabelas novas, sem exceção, default deny para `anon`.

O colaborador não usa Supabase Auth (mesmo caso de `SEC-RLS`) — a escrita passa pelo backend com
`service_role`, que ignora RLS. RLS aqui também é defesa em profundidade; o controle primário é
a autorização de aplicação, que checa `colaborador.rt_id = paciente.rt_id` **antes** de qualquer
leitura ou escrita (`RNP-01`).

```sql
-- Nenhuma policy para anon em paciente, agendamento, medicamento, prescricao,
-- administracao_medicamento. Ausência de policy com RLS habilitada já nega.

CREATE POLICY app_full ON paciente FOR ALL TO app_server USING (true) WITH CHECK (true);
CREATE POLICY app_full ON agendamento FOR ALL TO app_server USING (true) WITH CHECK (true);
CREATE POLICY app_full ON medicamento FOR ALL TO app_server USING (true) WITH CHECK (true);
CREATE POLICY app_full ON prescricao FOR ALL TO app_server USING (true) WITH CHECK (true);
CREATE POLICY app_full ON administracao_medicamento FOR ALL TO app_server USING (true) WITH CHECK (true);
```

Nenhuma dessas tabelas entra na publication de Realtime (`ALTER PUBLICATION supabase_realtime
ADD TABLE`). Diferente de `plantao` (sem dado pessoal), toda tabela deste módulo tem dado
sensível de saúde ou de identificação de paciente — a agenda em tempo real viaja por Broadcast
com payload filtrado no servidor (`RT-003`), nunca por Postgres Changes direto no cliente.

## Log e notificação

Regra idêntica a `SEC-CONF` "Dado pessoal nunca em", estendida:

- Notificação push/in-app sobre agendamento ou dose usa **texto genérico**
  ("Você tem uma consulta às 14h", "Dose pendente") — nunca nome do medicamento, condição
  clínica ou motivo de saída no corpo da notificação (`RNP-22`). Detalhe só depois de abrir o
  app autenticado.
- Log estruturado nunca contém `paciente.nome`, `observacoes_clinicas`, `prescricao.dose`,
  `prescricao.instrucoes` nem `administracao_medicamento.observacao`. Chaves adicionais no
  redator central (`src/server/log/redact.ts`, já usado por `SEC-CONF`).
- Auditoria (`audit_log`) é a única exceção: guarda o dado (é o propósito dela), mas
  `audit_log` já é restrito a admin (`SEC-CONF`, nível "Restrito").

## Retenção

| Dado | Retenção | Depois |
|---|---|---|
| `administracao_medicamento` | 20 anos (guarda de prontuário — Resolução CFM/normas de vigilância sanitária aplicáveis) | arquivado, nunca apagado |
| `prescricao` encerrada | 20 anos | arquivado |
| `agendamento` | 5 anos (alinhado a `audit_log`) | arquivado |
| Paciente `INATIVO` (alta/óbito/transferência externa) | 20 anos após inativação | dado clínico arquivado; identificação pseudonimizada |

Retenção de dado de saúde é mais longa que a de dado trabalhista (`SEC-CONF`, 5 anos) — não
unificar os dois jobs de expurgo.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| S1 | Colaborador da RT1 lendo paciente da RT2 via API | `404` |
| S2 | `anon key` lendo `paciente`, `prescricao`, `administracao_medicamento` | negado por RLS |
| S3 | Notificação de dose pendente | corpo sem nome de medicamento |
| S4 | Grep de `observacoes_clinicas`/`dose`/`instrucoes` em log | zero ocorrências |
| S5 | `app_readonly` lendo `prescricao` | negado |
| S6 | `app_server` executando `DELETE FROM administracao_medicamento` | negado |
