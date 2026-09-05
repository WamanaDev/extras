# API-ADM-MAR-002 — `POST /api/admin/marcacoes`

- **ID:** API-ADM-MAR-002
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `FN-005`, `02-seguranca/acid.md`
- **Entregáveis:** `src/app/api/admin/marcacoes/route.ts`

## Objetivo

Aloca extra em nome de um colaborador — cobertura de emergência, acerto fora do prazo.

## Contrato

### Request
```ts
{ plantaoId: string, colaboradorId: string, motivo: string }
```

### Response 201
Igual a `API-COL-004`, acrescido de `origem: 'ADMIN'`.

## Fluxo

1. `$transaction`: `marcar_extra(plantaoId, colaboradorId, 'ADMIN', ip, ua)`
2. Auditar `EXTRA_MARCADA` com `origem: ADMIN`, ator = admin e motivo
3. Broadcast

## ACID

Mesmas garantias de `FN-005`: advisory lock + `FOR UPDATE`. Nenhum atalho por ser admin.

## CIA

**I:** `origem = 'ADMIN'` pula **apenas** a checagem de janela (RN-27). Jornada, limite,
vaga e cruzada continuam valendo. O admin pode alocar fora do prazo; não pode criar escala
ilegal — a regra de 36h existe por segurança do trabalhador, não por conveniência
administrativa.
**R:** `motivo` obrigatório e ator registrado. Sem isso, o colaborador vê uma extra que não
marcou e não há como explicar de onde veio.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Alocação válida | 201, `origem = ADMIN` |
| 2 | Fora da janela | permitido |
| 3 | Criando 36h | `EXCEDE_JORNADA` |
| 4 | Acima do limite | `LIMITE_ATINGIDO` |
| 5 | Sem vaga | `SEM_VAGA` |
| 6 | Cruzada bloqueada | `CRUZADA_BLOQUEADA` |
| 7 | Sem motivo | 422 |
| 8 | Auditoria | ator = admin, motivo presente |
