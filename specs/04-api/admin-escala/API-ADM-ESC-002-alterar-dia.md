# API-ADM-ESC-002 — `PATCH /api/admin/escala/:id`

- **ID:** API-ADM-ESC-002
- **Status:** PRONTA — **alteração exige revisão humana**
- **Ator:** Admin
- **Pré-requisitos:** `01-dominio/codigos-escala.md`, `DOM-004`
- **Entregáveis:** `src/app/api/admin/escala/[id]/route.ts`

## Objetivo

Lança ou altera a ausência de um dia (D → F/FT/FE ou volta).

## Contrato

### Request
```ts
{ codigo: string, observacao?: string, confirmarImpacto?: boolean }
```

### Response 200
```ts
{ escalaDia, impacto: { extrasAfetadas: [...], coberturaAntes, coberturaDepois } }
```

### Erros
`CODIGO_INVALIDO` 422 · `CICLO_FECHADO` 409 · `IMPACTO_NAO_CONFIRMADO` 409 ·
`EXCEDE_JORNADA` 409

## Fluxo

1. Bloquear se ciclo `FECHADO`
2. Advisory lock do colaborador (mesma ordem de `FN-005`)
3. Calcular impacto: extras marcadas no mesmo dia; cobertura antes/depois
4. Impacto sem `confirmarImpacto` → 409 com a lista (RN-10)
5. **Se o novo código tiver `ocupaHorario = true`**, revalidar a jornada do colaborador —
   voltar `F` para `D` ou `FT` pode criar 36h com extras já marcadas
6. Aplicar, auditar `AUSENCIA_ALTERADA` com anterior → novo
7. Broadcast `escala:atualizada`

## ACID

**A:** cálculo de impacto, revalidação e escrita numa transação.
**I:** advisory lock do colaborador impede que a alteração corra contra uma marcação de extra
em andamento (anomalia A6 de `SEC-ACID`). Sem ele, o admin lança `FT` no mesmo instante em
que o colaborador marca extra adjacente, e as 36h passam.
**C:** exclusion constraint de `escala_dia` continua valendo.

## CIA

**I:** o passo 5 é o mais fácil de esquecer. `F` → `D` transforma um dia livre em
bloco ocupado; se houver extras em volta, a jornada pode passar de 24h retroativamente.
Revalidar e recusar com `EXCEDE_JORNADA` é o comportamento correto — o admin cancela a extra
antes, conscientemente.
**C:** `observacao` restrita ao admin.
**R:** auditoria com anterior → novo e motivo.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | `D` → `F` sem extras | aplicado |
| 2 | `D` → `F` com extra no dia | `IMPACTO_NAO_CONFIRMADO` |
| 3 | Confirmado | aplicado, extra mantida, impacto auditado |
| 4 | `F` → `FT` criando 36h | `EXCEDE_JORNADA` |
| 5 | Código inexistente | 422 |
| 6 | Ciclo fechado | 409 |
| 7 | Concorrente com marcação de extra | serializado, sem violação |
| 8 | Cobertura cruzando o mínimo | aviso no impacto |
