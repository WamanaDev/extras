# API-ADM-COL-008 — `POST /api/admin/colaboradores/:id/desbloquear`

- **ID:** API-ADM-COL-008
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/colaboradores/[id]/desbloquear/route.ts`

## Objetivo

Libera conta bloqueada por excesso de tentativas antes do prazo automático.

## Contrato

### Response 200
```ts
{ id, bloqueado: false, tentativasRecentes: Array<{ ip, criadoEm, motivo }> }
```

## Fluxo

1. Zerar `tentativasFalhas` e `bloqueadoAte`
2. Devolver as últimas 10 tentativas para o admin avaliar
3. Auditar `CONTA_DESBLOQUEADA`

## ACID

Uma transação.

## CIA

**C:** as tentativas mostram IP e horário — permitem distinguir "esqueci o PIN" de
ataque real. Se vierem de IPs variados, o admin deve resetar o PIN, não só desbloquear.
**D:** o bloqueio expira sozinho em 15 min; esta rota é conveniência, não a única saída
(`SEC-DISP`).

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Conta bloqueada | desbloqueada |
| 2 | Tentativas recentes | retornadas com IP |
| 3 | Login em seguida | funciona |
| 4 | Auditoria | registrada |
