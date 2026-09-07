# Auditoria

- **ID:** SEC-AUD
- **Status:** PRONTA
- **Entregáveis:** `src/server/audit/registrar.ts`, job de validação da cadeia

## Objetivo

Responder, meses depois: **quem fez o quê, quando, de onde e com que resultado.**
Sem isso, "não fui eu que marquei" é indiscutível.

## Eventos auditados

| Ação | Ator | Payload |
|---|---|---|
| `LOGIN_SUCESSO` / `LOGIN_FALHA` | Colaborador | matrícula, motivo |
| `PIN_DEFINIDO` / `PIN_RESETADO` | Colaborador / Admin | — |
| `SESSAO_REVOGADA` | Admin | colaboradorId, quantidade |
| `EXTRA_MARCADA` / `EXTRA_CANCELADA` | Ambos | plantaoId, data, turno, rt, cruzada, origem |
| `ESCALA_GERADA` | Admin | cicloId, linhas criadas |
| `AUSENCIA_ALTERADA` | Admin | colaboradorId, data, código anterior → novo, motivo |
| `ESCALA_TROCADA` | Admin | âncora anterior → nova, vigência |
| `LIMITE_ALTERADO` | Admin | colaboradorId, anterior → novo |
| `CRUZADA_ALTERADA` | Admin | escopo, anterior → novo, marcações afetadas |
| `CICLO_PUBLICADO` / `CICLO_FECHADO` | Admin | cicloId |
| `PLANTAO_CRIADO` / `ALTERADO` / `REMOVIDO` | Admin | antes → depois |
| `COLABORADOR_CRIADO` / `ALTERADO` / `DESATIVADO` | Admin | campos alterados (sem PIN) |
| `EXPORTACAO_DADOS` | Admin | escopo, formato, nº de registros |
| `LOGOUT` | Colaborador | — |
| `LOGIN_ADMIN_SUCESSO` / `LOGIN_ADMIN_FALHA` | Admin | e-mail, motivo (na falha) |
| `CONTA_DESBLOQUEADA` | Admin | reaproveita `COLABORADOR_ALTERADO` com `payload.acaoEspecifica: 'CONTA_DESBLOQUEADA'` (evento mais próximo — desbloqueio é mudança de estado da conta) |

`EXPORTACAO_DADOS` importa: exportação em massa é o caminho mais silencioso para vazamento.

## Campos

```
id · ator_tipo · ator_id · acao · entidade · entidade_id · payload(jsonb)
ip · user_agent · request_id · criado_em · hash_anterior · hash
```

`payload` guarda **antes e depois** em alteração. Nunca PIN ou token — o redator de
`SEC-CONF` é aplicado antes da gravação.

## Regras

| ID | Regra |
|---|---|
| AUD-1 | Append-only: `UPDATE` e `DELETE` revogados de `app_server`. |
| AUD-2 | Gravação na **mesma transação** da ação. Ação commitada sem log é bug. |
| AUD-3 | Falha ao gravar log **aborta** a ação. Não existe ação silenciosa. |
| AUD-4 | Cadeia de hash validada diariamente; quebra = alerta crítico. |
| AUD-5 | `request_id` correlaciona log de aplicação e trilha de auditoria. |
| AUD-6 | Retenção de 5 anos; depois `ator_id` vira hash irreversível. |
| AUD-7 | Consulta à auditoria é ela própria auditada (`AUDITORIA_CONSULTADA`). |

AUD-3 é a regra que costuma ser afrouxada "para não derrubar o fluxo". Não afrouxar: uma
marcação que existe sem rastro vale menos que uma marcação que falhou e o usuário repetiu.

## Interface

```ts
await registrarAuditoria(tx, {
  atorTipo: 'COLABORADOR', atorId: colab.id,
  acao: 'EXTRA_MARCADA', entidade: 'marcacao', entidadeId: marcacao.id,
  payload: { plantaoId, data, turno, rt, cruzada },
  ip, userAgent, requestId,
});
```

Recebe `tx` obrigatoriamente — a assinatura força AUD-2. Não existe overload sem transação.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| A1 | Marcar extra | log com IP, UA e `request_id` |
| A2 | Rollback da ação | nenhum log gravado |
| A3 | Falha proposital na gravação do log | ação aborta |
| A4 | `UPDATE` em `audit_log` | negado |
| A5 | Adulteração de linha | job detecta quebra da cadeia |
| A6 | PIN em `payload` | redigido |
| A7 | Exportação de relatório | gera `EXPORTACAO_DADOS` |
