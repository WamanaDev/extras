# API-ADM-MAR-004 — Solicitações de cancelamento

- **ID:** API-ADM-MAR-004
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `FN-006`, `API-COL-005`
- **Entregáveis:**
  `src/app/api/admin/solicitacoes-cancelamento/route.ts`,
  `src/app/api/admin/solicitacoes-cancelamento/[id]/aprovar/route.ts`,
  `src/app/api/admin/solicitacoes-cancelamento/[id]/recusar/route.ts`,
  `src/server/services/solicitacoes-cancelamento.ts`

## Objetivo

Fila de pedidos de cancelamento de extra abertos por colaboradores (`API-COL-005`), para
**qualquer** admin revisar, aprovar ou recusar — pedido do usuário: não existe dono do
pedido, nenhuma checagem de qual admin pode decidir.

## Contrato

### `GET /api/admin/solicitacoes-cancelamento?status=&pagina=&tamanho=`

Query: `status` opcional (`PENDENTE`/`APROVADA`/`RECUSADA`, sem filtro lista todas) +
paginação padrão (`04-api/contrato-comum.md`).

Response 200:
```ts
{
  itens: Array<{
    id, colaborador: { id, nome, matricula },
    marcacao: { id, data, tipo, rt, horaInicio, horaFim },
    motivo, status, motivoResolucao, criadoEm, resolvidoEm,
  }>,
  total: number,
}
```

Ordenação: `PENDENTE` primeiro (fila de trabalho), dentro do mesmo status a mais antiga
primeiro (FIFO). Cache `pessoal` (não compartilhável entre admins de sessões diferentes).

### `POST /api/admin/solicitacoes-cancelamento/:id/aprovar`

Request: `{ motivoResolucao?: string }` (opcional — anotação livre do admin, não é exigida
para aprovar).

Response 200:
```ts
{ id, status: 'APROVADA', marcacaoId, colaboradorId }
```

### `POST /api/admin/solicitacoes-cancelamento/:id/recusar`

Request: `{ motivoResolucao: string }` (**obrigatório** — é o que explica ao colaborador por
que o pedido não foi aceito).

Response 200:
```ts
{ id, status: 'RECUSADA', marcacaoId, colaboradorId }
```

### Erros (aprovar/recusar)
`SOLICITACAO_INEXISTENTE` 404 · solicitação já resolvida por outro admin 409 · `motivoResolucao` ausente em recusar 422

## Fluxo

**Aprovar:**
1. Buscar solicitação, exigir `PENDENTE` (409 se já resolvida — corrida entre dois admins)
2. `$transaction`: `cancelar_extra(marcacaoId, adminId, 'ADMIN')` (mesmo `$queryRaw` de
   `API-ADM-MAR-003`) + `UPDATE solicitacao_cancelamento` para `APROVADA` + auditoria
   (`CANCELAMENTO_APROVADO`, ator `ADMIN`)
3. Commit
4. Depois do commit: `criarNotificacao` para o colaborador (falha aqui não desfaz a
   aprovação nem retorna erro — try/catch próprio, mesmo padrão de `publicarCiclo`)

**Recusar:**
1. Buscar solicitação, exigir `PENDENTE`
2. `$transaction`: `UPDATE solicitacao_cancelamento` para `RECUSADA` com
   `motivoResolucao` + auditoria (`CANCELAMENTO_RECUSADO`, ator `ADMIN`) — **nunca** toca a
   marcação, que continua `CONFIRMADA`
3. Commit
4. Depois do commit: `criarNotificacao` para o colaborador (mesmo padrão acima)

## Autorização

Qualquer admin autenticado, sem checagem de qual — pedido explícito do usuário (não existe
"dono" do pedido de cancelamento, diferente de outras filas que restringem por RT/dono).

## ACID

Aprovar: `cancelar_extra` + `UPDATE` da solicitação + auditoria numa única transação —
nunca aprovar sem cancelar de fato, nem cancelar sem marcar a solicitação como resolvida.
Idempotente por herança de `FN-006` (cancelar já cancelado é no-op), mas uma segunda
aprovação da mesma solicitação já resolvida cai em 409 antes de chegar em `cancelar_extra`
— duplo clique de dois admins nunca dispara `cancelar_extra` duas vezes.

Notificação é sempre depois do commit (SEC-ACID): sucesso da aprovação/recusa nunca
depende de notificação ter ido.

## CIA

**C:** lista traz colaborador e marcação de qualquer um — tela restrita a admin (mesmo
padrão de `API-ADM-MAR-001`).
**I:** recusar nunca gera `UPDATE`/`cancelar_extra` em `marcacao` — só aprovar aciona
`FN-006`. Índice único parcial (`solicitacao_cancelamento_pendente_unica`,
`03-banco/modelo-dados.md`) garante que nunca há dois pedidos `PENDENTE` simultâneos para a
mesma marcação, então nunca há ambiguidade sobre qual pedido está sendo resolvido.
**R:** `motivoResolucao` obrigatório em recusa — colaborador sempre sabe o porquê.
**D:** aprovar/recusar são idempotentes contra corrida entre dois admins (409, não
duplicação de efeito).

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Listar sem filtro | `PENDENTE` primeiro, FIFO dentro do status |
| 2 | Listar `?status=PENDENTE` | só pendentes |
| 3 | Aprovar pedido `PENDENTE` | 200, marcação `CANCELADA`, saldo devolvido, notificação enviada |
| 4 | Aprovar já resolvido (por outro admin) | 409 |
| 5 | Recusar `PENDENTE` sem `motivoResolucao` | 422 |
| 6 | Recusar `PENDENTE` com motivo | 200, marcação continua `CONFIRMADA`, notificação enviada |
| 7 | Aprovar/recusar id inexistente | 404 |
| 8 | Auditoria de aprovação | ator `ADMIN`, `CANCELAMENTO_APROVADO` |
| 9 | Auditoria de recusa | ator `ADMIN`, `CANCELAMENTO_RECUSADO` |
| 10 | Falha ao notificar após aprovar | aprovação continua efetivada (200), erro só logado |
