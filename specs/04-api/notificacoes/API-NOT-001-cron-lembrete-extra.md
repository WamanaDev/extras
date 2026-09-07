# API-NOT-001 — `GET /api/cron/lembrete-extra?turno=DIURNO|NOTURNO`

- **ID:** API-NOT-001
- **Status:** PRONTA
- **Ator:** Nenhum dos quatro tipos do contrato comum (`PUBLICO`/`COLABORADOR`/`ADMIN`/`QUALQUER`) —
  webhook interno da plataforma, autenticado por segredo compartilhado, não por sessão
- **Pré-requisitos:** `04-api/contrato-comum.md`, `00-fundacao/ambiente.md`
- **Entregáveis:** `src/app/api/cron/lembrete-extra/route.ts`, `src/server/notificacoes/lembrete-extra.ts`,
  `vercel.json`

## Objetivo

Avisar colaboradores com extra confirmada de que o plantão está próximo, via notificação
in-app + push (`criarNotificacao`). Origem: pedido do usuário por lembrete automático de
extra confirmada.

Não é literalmente "4 horas antes" — os dois horários fixos abaixo dão cerca de 11h de
antecedência para os turnos reais (diurno `07:00–19:00`, noturno `19:00–07:00`,
`01-dominio/escala-12x36.md`). "4 horas" foi a explicação aproximada do pedido original
para o motivo do lembrete; os horários fixos é que valem como regra (ver `_conflitos.md`).

## Fora do pipeline padrão

Esta rota **não** usa `defineHandler` (`04-api/contrato-comum.md`) de propósito: não é
chamada por sessão de usuário autenticado, é um webhook disparado pela própria plataforma
(Vercel Cron Jobs). Autenticação por header `Authorization: Bearer <CRON_SECRET>`, comparado
a `process.env.CRON_SECRET` (`src/env.ts`, opcional — sem a variável configurada, a rota
recusa toda chamada; não é falha de boot).

## Contrato

### Request
`GET /api/cron/lembrete-extra?turno=DIURNO|NOTURNO`
Header `Authorization: Bearer <CRON_SECRET>` obrigatório.

### Response 200
```ts
{
  turno: 'DIURNO' | 'NOTURNO',
  dataAlvo: string,      // AAAA-MM-DD, data civil America/Sao_Paulo
  notificadas: number,
  jaNotificadas: number, // deduplicadas nesta execução
}
```

### Erros
`NAO_AUTENTICADO` 401 (header ausente ou não bate com `CRON_SECRET`) ·
`VALIDACAO` 422 (`turno` ausente ou fora de `DIURNO`/`NOTURNO`) ·
`ERRO_INTERNO` 500 (logado com `redigirParaLog`, nunca vaza detalhe)

## Fluxo

1. Validar `CRON_SECRET` e `turno`
2. Resolver a data-alvo a partir de `agora` (injetado, não `new Date()` direto — mesma
   convenção do contrato comum) e do turno:
   - `NOTURNO` → **hoje** (o job roda de manhã, 08:00 BRT, para o plantão que começa à
     noite do mesmo dia)
   - `DIURNO` → **amanhã** (o job roda à noite, 20:00 BRT, para o plantão que começa de
     manhã do dia seguinte)
3. Buscar `marcacao` com `status = 'CONFIRMADA'` cujo `plantao.data` e `plantao.tipo`
   batam com a data-alvo e o turno pedido
4. Para cada colaborador encontrado: montar `link = /minhas-extras?marcacaoId=<id>` e
   checar se já existe notificação `tipo = 'LEMBRETE_EXTRA'` com o mesmo `link` para o
   mesmo colaborador — se existir, contar em `jaNotificadas` e pular
5. Senão, chamar `criarNotificacao` (tipo `LEMBRETE_EXTRA`, mensagem com o RT e horário de
   início) e contar em `notificadas`

## Agendamento

`vercel.json` registra dois crons:

| Cron | Horário UTC | Horário BRT | `turno` |
|---|---|---|---|
| lembrete noturno | `0 11 * * *` | 08:00 | `NOTURNO` |
| lembrete diurno | `0 23 * * *` | 20:00 | `DIURNO` |

`America/Sao_Paulo` é UTC-3 fixo (sem horário de verão desde 2019), mesma constante usada
em `lib/escala/blocos.ts` — os horários UTC acima não variam ao longo do ano.

## ACID

Idempotência por dedupe de `link`, não por constraint de banco: uma reexecução do mesmo
cron no mesmo dia (retry da plataforma, disparo manual) encontra a notificação já criada e
não duplica, mas duas execuções verdadeiramente concorrentes podem, em tese, criar duas
notificações para o mesmo colaborador — aceito como best-effort, mesma filosofia de
`push.ts`/`criar.ts`; não vale a complexidade de uma constraint só para este caso.

## CIA

**C:** a rota não expõe dado de terceiro na resposta — só contadores agregados.
**I:** sem `CRON_SECRET` válido, a rota nunca cria notificação nem vaza se a marcação existe.
**D:** falha ao enviar push para um colaborador nunca falha a notificação in-app nem a
execução do lote inteiro (`criarNotificacao` isola a falha de push).

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Sem header `Authorization` | `401 NAO_AUTENTICADO` |
| 2 | `CRON_SECRET` incorreto | `401 NAO_AUTENTICADO` |
| 3 | `CRON_SECRET` não configurada no ambiente | `401` para qualquer chamada |
| 4 | `turno` ausente ou inválido | `422 VALIDACAO` |
| 5 | `turno=NOTURNO`, extra confirmada hoje à noite | notificação criada, `notificadas = 1` |
| 6 | `turno=DIURNO`, extra confirmada amanhã de dia | notificação criada, `notificadas = 1` |
| 7 | Execução repetida no mesmo dia/turno | segunda chamada conta em `jaNotificadas`, não duplica |
| 8 | Marcação `CANCELADA` no dia/turno | não gera notificação |
| 9 | Sem nenhuma extra confirmada no dia/turno | `200` com `notificadas = 0` |
