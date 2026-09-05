# API-COL-004 — `POST /api/marcacoes`

- **ID:** API-COL-004
- **Status:** PRONTA — **alteração exige revisão humana**
- **Ator:** Colaborador
- **Pré-requisitos:** `FN-005`, `02-seguranca/acid.md`
- **Entregáveis:** `src/app/api/marcacoes/route.ts`

## Objetivo

Marca uma extra. Rota de maior contenção e maior risco do sistema.

## Contrato

### Request
```ts
{ plantaoId: string }              // uuid
```
Header opcional `Idempotency-Key`.

### Response 201
```ts
{ id, plantaoId, data, tipo, rt, cruzada, saldo: { limite, usadas, restantes } }
```

### Erros (todos 409, salvo indicado)
`PLANTAO_INDISPONIVEL` · `CICLO_FECHADO` · `JANELA_NAO_ABERTA` · `JANELA_ENCERRADA` ·
`COLABORADOR_BLOQUEADO` · `CRUZADA_BLOQUEADA` · `EM_AUSENCIA` · `CONFLITO_DE_HORARIO` ·
`EXCEDE_JORNADA` · `LIMITE_ATINGIDO` · `SEM_VAGA` · `JA_MARCADO` ·
`SISTEMA_OCUPADO` (503, com `Retry-After`)

## Autorização

Colaborador autenticado. `colaboradorId` **da sessão**, nunca do body — enviar o
campo é ignorado, não é erro (`SEC-INT`, T2).

## Fluxo

1. Rate limit por sessão (10/min)
2. Se houver `Idempotency-Key`, consultar Redis; se houver resultado, devolvê-lo e encerrar
3. `$transaction`:
   a. `SELECT * FROM marcar_extra(plantaoId, ator.id, 'COLABORADOR', ip, userAgent)`
   b. `registrarAuditoria(tx, { acao: 'EXTRA_MARCADA', … })`
4. Commit
5. **Depois do commit:** broadcast `marcacao:criada` no canal do ciclo
6. Gravar resultado no Redis sob a chave de idempotência (TTL 24h)

## ACID

**A:** marcação + contador + auditoria na mesma transação. Broadcast só após o
commit — evento de algo revertido é pior que evento atrasado (`SEC-ACID`).
**C:** `chk_vagas` e o índice único parcial são a rede final.
**I:** advisory lock por colaborador + `FOR UPDATE` no plantão, dentro de `FN-005`.
Nenhum lock é adquirido na camada da aplicação.
**D:** `synchronous_commit = on`. Idempotência protege contra retry de rede.

## CIA

**C:** resposta traz só o saldo do próprio ator. Nada sobre outros marcadores.
**I:** validação inteira refeita no banco; UI é conveniência (`SEC-INT`).
`X-Requested-With` obrigatório (CSRF).
**D:** rate limit por sessão; `409` é resultado esperado no pico, não erro — o cliente
mostra o motivo e recarrega a grade, sem toast de falha genérico.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Caminho feliz | 201, contador +1, auditoria gravada |
| 2 | 20 paralelas, 1 vaga | 1× 201, 19× `SEM_VAGA` |
| 3 | Mesmo `Idempotency-Key` 3× | 1 marcação, 3 respostas iguais |
| 4 | Duplo clique sem a chave | segunda recebe `JA_MARCADO` |
| 5 | `colaboradorId` de terceiro no body | ignorado |
| 6 | Sem `X-Requested-With` | 403 |
| 7 | Falha na auditoria | marcação revertida |
| 8 | Broadcast antes do commit | falha de revisão |
| 9 | Rate limit 11ª em 1 min | 429 |
| 10 | `lock_timeout` estourado | 503 + `Retry-After` |
