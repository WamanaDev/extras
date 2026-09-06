# Canais de Realtime — pacientes

- **ID:** RT-003
- **Status:** RASCUNHO
- **Pré-requisitos:** `05-realtime/canais.md`, `SEC-SAUDE`
- **Entregáveis:** `src/hooks/useAgendaRealtime.ts`, extensão de `src/server/realtime/broadcast.ts`

## Canal

Um canal por RT: `rt:{rtId}:pacientes`. Colaborador assina a própria RT; admin pode assinar
qualquer uma.

## Eventos (tudo Broadcast — nenhuma tabela deste módulo entra em Postgres Changes)

| Evento | Payload | Quem recebe |
|---|---|---|
| `agendamento:criado` | `{ agendamentoId, pacienteId, tipo, inicioEm }` | colaboradores da RT do agendamento |
| `agendamento:atualizado` | `{ agendamentoId, campos: string[] }` | idem |
| `agendamento:cancelado` | `{ agendamentoId }` | idem |
| `medicacao:dose-atrasada` | `{ administracaoId, pacienteId }` — **sem** nome de medicamento | idem |
| `medicacao:administrada` | `{ administracaoId, pacienteId }` | idem |

## Por que nada em Postgres Changes

Diferente de `RT-001` (`plantao` sem dado pessoal), toda tabela deste módulo carrega dado
sensível de paciente (`SEC-SAUDE`). Postgres Changes não filtra por RT no cliente — vazaria
paciente da RT2 para quem assina no navegador com a `anon key`. O Broadcast já nasce filtrado no
servidor, para o canal da RT correta.

## Notificação (reaproveita infraestrutura existente)

O schema já tem `notificacao` e `push_subscription` (colaborador), hoje sem gatilho de negócio.
Este módulo é o primeiro a povoá-las:

- Job a cada 5 min chama `alertas_medicamento` (`FN-014`) por RT e cria `notificacao` +
  dispara Web Push para os colaboradores da RT, com título genérico (`SEC-SAUDE`, `RNP-22`).
- `agendamento:criado` com `inicioEm` nas próximas 2h também gera lembrete — mesmo texto genérico.

## Regra de refetch

Igual a `RT-001`: ao receber qualquer evento do canal, o cliente refaz o fetch de `API-AGE-001`
ou `API-MED-006`/`API-MED-007`, com debounce de 500 ms. Nenhum estado é recalculado localmente.

## Broadcast só após commit

Mesma regra de `RT-001` (`SEC-ACID`) — emitido pelo handler depois da transação confirmada.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| RT3-1 | A cria agendamento, B (mesma RT) vê em < 2 s | sim |
| RT3-2 | C (outra RT) não recebe o evento | confirmado |
| RT3-3 | Payload de `medicacao:dose-atrasada` | sem nome de medicamento |
| RT3-4 | `anon` assinando `rt:{rtId}:pacientes` | negado |
| RT3-5 | Transação com rollback | nenhum evento emitido |
| RT3-6 | Job de alerta rodando duas vezes | não duplica `notificacao` |
