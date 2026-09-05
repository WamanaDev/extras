# API-ADM-REL-003 — `GET /api/admin/auditoria`

- **ID:** API-ADM-REL-003
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `02-seguranca/auditoria.md`
- **Entregáveis:** `src/app/api/admin/auditoria/route.ts`

## Objetivo

Consulta a trilha de auditoria.

## Contrato

### Query
`?entidade=&entidadeId=&atorId=&acao=&de=&ate=&pagina=&tamanho=`

### Response 200
```ts
{ eventos: Array<{ id, criadoEm, atorTipo, atorId, atorNome, acao,
    entidade, entidadeId, payload, ip, userAgent, requestId,
    integridade: 'OK' | 'QUEBRADA' }> }
```

## Fluxo

1. Filtrar e paginar
2. Validar a cadeia de hash dos eventos retornados
3. Auditar `AUDITORIA_CONSULTADA`

## ACID

Leitura. `audit_log` é append-only, então não há risco de leitura inconsistente.

## CIA

**I:** o campo `integridade` mostra o resultado da validação da cadeia por evento. Sem
isso, a trilha adulterada parece íntegra na tela (`SEC-INT`).
**R:** AUD-7 — consultar a auditoria é ele próprio auditado. Quem investiga também é
registrado; isso protege tanto contra abuso quanto contra a acusação de abuso.
**D:** paginação obrigatória; índices `idx_audit_entidade` e `idx_audit_ator`.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Filtro por entidade | correto |
| 2 | Consulta gera `AUDITORIA_CONSULTADA` | sim |
| 3 | Linha adulterada | `integridade: 'QUEBRADA'` |
| 4 | PIN no payload | ausente |
| 5 | Colaborador chamando | 403 |
