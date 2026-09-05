# Observabilidade

- **ID:** OPS-002
- **Status:** PRONTA
- **Pré-requisitos:** `02-seguranca/disponibilidade.md`

## Log estruturado

JSON com `requestId`, `atorTipo`, `atorId`, `rota`, `status`, `duracaoMs`, `erro`.
Campos proibidos: `pin`, `token`, `cookie`, `authorization` — redator central
obrigatório (`SEC-CONF`).

`requestId` propagado até o `audit_log`, ligando log técnico e trilha de negócio.

## Métricas

| Métrica | Alerta |
|---|---|
| Taxa de 5xx | > 1% em 5 min |
| p95 de `POST /api/marcacoes` | > 1,5 s em 5 min |
| p95 de `GET /api/plantoes` | > 800 ms em 5 min |
| Conexões em uso | > 80% do pool |
| Deadlocks | qualquer |
| Divergência de `vagas_ocupadas` | qualquer |
| Cadeia de auditoria quebrada | qualquer (crítico) |
| Falha do job de expurgo | qualquer |
| Lag do Realtime | > 5 s |
| Contas bloqueadas na última hora | > 5 |
| Marcações violando jornada | qualquer (crítico) |

As duas últimas são as mais valiosas e as que ninguém lembra de instrumentar: a primeira
sinaliza ataque; a segunda sinaliza que uma regra vazou.

## Jobs

| Job | Frequência | Falha |
|---|---|---|
| Reconciliação de `vagas_ocupadas` | 10 min | alerta, **não corrige** |
| Validação da cadeia de auditoria | diário | alerta crítico |
| Marcações violando jornada | diário | alerta crítico |
| Expurgo de `tentativa_login` (90d) | diário | alerta |
| Expurgo de sessões expiradas (30d) | diário | alerta |
| Backup lógico | diário | alerta crítico |

A reconciliação **alerta e não corrige** de propósito (`SEC-ACID`): corrigir sozinha
mascararia o bug que causou a divergência, e o bug voltaria maior.

## Dashboard operacional

Uma tela: estado do ciclo atual, janela aberta/fechada, marcações na última hora, vagas em
aberto, dias com déficit, contas bloqueadas, saúde do Realtime.
