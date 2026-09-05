# Canais de Realtime

- **ID:** RT-001
- **Status:** PRONTA
- **Pré-requisitos:** `02-seguranca/rls-policies.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/hooks/usePlantoesRealtime.ts`, `src/server/realtime/broadcast.ts`

## Canal

Um canal por ciclo: `ciclo:{cicloId}`. Colaborador assina o ciclo publicado vigente; admin
assina o ciclo em edição.

## Eventos

| Fonte | Evento | Payload | Quem recebe |
|---|---|---|---|
| Postgres Changes `plantao` | `UPDATE` | `id`, `vagas_ocupadas`, `vagas_totais` | todos |
| Postgres Changes `plantao` | `INSERT`/`DELETE` | plantão publicado ou removido | todos |
| Broadcast | `marcacao:criada` | `{ plantaoId }` | todos |
| Broadcast | `marcacao:criada` | `{ plantaoId, marcacaoId }` | só o autor |
| Broadcast | `marcacao:cancelada` | `{ plantaoId }` | todos |
| Broadcast | `escala:atualizada` | `{ colaboradorId, data }` | admin + o próprio |
| Broadcast | `ciclo:atualizado` | `{ cicloId, campos: string[] }` | todos |

## Por que só `plantao` em Postgres Changes

`plantao` não tem dado pessoal, então pode ser lida no navegador com a `anon key` sob a
policy de `SEC-RLS`. `marcacao` e `escala_dia` **nunca** entram na publication: quem pegou
qual plantão e quem está de folga são dados internos, e Postgres Changes não permite filtrar
por ator. O que o cliente precisa saber viaja por Broadcast, com payload montado no servidor.

## Regra de refetch

Um evento de outro colaborador pode mudar o **motivo de bloqueio** dos plantões do usuário
atual — a última vaga acabou, por exemplo. O cliente **não** tenta recalcular localmente:
ao receber qualquer evento do canal, refaz o fetch de `API-COL-003`.

O incremento de `vagas_ocupadas` do Postgres Changes pode ser aplicado direto na célula, para
resposta imediata, mas o refetch (com debounce de 500 ms) é a fonte de verdade.

## Broadcast só após commit

`SEC-ACID`: emitir dentro da transação faria o cliente receber evento de algo que sofreu
rollback. A função `broadcast()` recebe o resultado da transação já commitada.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| RT-1 | A marca, B vê o contador subir | < 2 s |
| RT-2 | Última vaga tomada | célula de B vira `SEM_VAGA` |
| RT-3 | Payload de `marcacao:criada` para terceiros | sem `colaboradorId` |
| RT-4 | `anon` assinando `marcacao` | negado |
| RT-5 | Transação com rollback | nenhum evento emitido |
| RT-6 | 10 eventos em 1 s | um refetch (debounce) |
