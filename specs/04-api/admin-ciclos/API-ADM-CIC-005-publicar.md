# API-ADM-CIC-005 — `POST /api/admin/ciclos/:id/publicar`

- **ID:** API-ADM-CIC-005
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/integridade.md`
- **Entregáveis:** `src/app/api/admin/ciclos/[id]/publicar/route.ts`

## Objetivo

RASCUNHO → PUBLICADO. Torna os plantões visíveis aos colaboradores.

## Contrato

### Request
```ts
{ ignorarAvisos?: boolean }
```

### Response 200
```ts
{ ciclo, avisos: Array<{ tipo, detalhe }> }
```

### Erros
`ESCALA_NAO_GERADA` 409 · `SEM_PLANTOES` 409 · `AVISOS_NAO_CONFIRMADOS` 409 · `TRANSICAO_INVALIDA` 409

## Fluxo

1. Exigir `escalaGeradaEm` preenchido e ao menos um plantão ativo
2. Levantar avisos: dias com déficit de cobertura (`FN-009`), colaboradores sem escala,
   janela no passado
3. Avisos + `ignorarAvisos !== true` → 409 com a lista
4. `UPDATE status = 'PUBLICADO'`, auditar `CICLO_PUBLICADO`
5. Broadcast `ciclo:atualizado`

## ACID

**A:** transição + auditoria numa transação.
**I:** `FOR UPDATE` no ciclo; transição só de `RASCUNHO`. Duas publicações concorrentes:
a segunda vê `PUBLICADO` e recebe `TRANSICAO_INVALIDA`.

## CIA

**I:** publicar é irreversível na prática — colaboradores já terão visto e marcado.
Por isso a checagem de pré-condições é dura e os avisos exigem confirmação explícita.
**D:** publicar com a janela já aberta dispara o pico imediatamente; o aviso alerta para
publicar antes e deixar a janela abrir sozinha.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Publicação válida | `PUBLICADO` |
| 2 | Sem escala gerada | `ESCALA_NAO_GERADA` |
| 3 | Sem plantões | `SEM_PLANTOES` |
| 4 | Com déficit de cobertura | `AVISOS_NAO_CONFIRMADOS` |
| 5 | Com `ignorarAvisos` | publica |
| 6 | Já publicado | `TRANSICAO_INVALIDA` |
| 7 | Duas publicações concorrentes | uma só |
