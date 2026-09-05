# API-ADM-COL-006 — `POST /api/admin/colaboradores/:id/trocar-escala`

- **ID:** API-ADM-COL-006
- **Status:** PRONTA — **alteração exige revisão humana**
- **Ator:** Admin
- **Pré-requisitos:** `01-dominio/escala-12x36.md`, `FN-002`
- **Entregáveis:** `src/app/api/admin/colaboradores/[id]/trocar-escala/route.ts`

## Objetivo

Registra mudança de turno ou de âncora com data de vigência. Nunca sobrescreve a âncora anterior.

## Contrato

### Request
```ts
{ vigenciaInicio: string, turno: 'DIURNO'|'NOTURNO', ancora: string,
  periodo?: number, motivo: string, regerarEscala?: boolean }
```

### Response 201
```ts
{ troca, previewMeses: [...], escalaRegerada?: { criados, removidos } }
```

### Erros
`VIGENCIA_NO_PASSADO` 409 · `CICLO_FECHADO` 409 · `EXCEDE_JORNADA` 409

## Fluxo

1. Vigência não pode cair em ciclo `FECHADO`
2. Inserir em `troca_escala` — **nunca** `UPDATE` na âncora do cadastro
3. `regerarEscala = true`: para cada ciclo aberto a partir da vigência, remover
   `escala_dia` com código `D` e **sem** extra vinculada, e regerar por `FN-002`
4. Revalidar a jornada de quem tiver extras marcadas; violação → 409 com a lista
5. Auditar `ESCALA_TROCADA` com anterior → nova e o motivo

## ACID

**A:** troca + regeneração + revalidação numa transação.
**I:** advisory lock do colaborador durante a regeneração.
**C:** a exclusion constraint de `escala_dia` impede que a regeneração deixe sobreposição.

## CIA

**I:** o passo 3 remove apenas dias com código `D` e sem extra. Ausências lançadas
(`F`/`FT`/`FE`) e dias com extra marcada **permanecem** e são reportados como conflito, para
o admin decidir. Apagar tudo e regerar seria mais simples e destruiria trabalho manual.
**R:** `motivo` obrigatório. Troca de escala mexe na vida da pessoa; o registro precisa
dizer por quê.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Troca vigente dia 15 | 1–14 antiga, 15–30 nova |
| 2 | Âncora do cadastro | inalterada |
| 3 | Mês anterior | intacto |
| 4 | Regeneração com `F` lançada | `F` preservado, reportado |
| 5 | Regeneração com extra marcada | dia preservado, reportado |
| 6 | Troca criando 36h | 409 com a lista |
| 7 | Vigência em ciclo fechado | 409 |
| 8 | Sem motivo | 422 |
