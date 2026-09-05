# API-ADM-CIC-003 — `POST /api/admin/ciclos/:id/gerar-escala`

- **ID:** API-ADM-CIC-003
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `FN-002`, `01-dominio/escala-12x36.md`
- **Entregáveis:** `src/app/api/admin/ciclos/[id]/gerar-escala/route.ts`

## Objetivo

Materializa a escala base do mês a partir das âncoras. Idempotente.

## Contrato

### Response 200
```ts
{ criados: number, jaExistentes: number,
  pulados: Array<{ colaboradorId, nome, matricula, motivo: 'SEM_ANCORA' | 'SEM_TURNO' }> }
```

### Erros
`CICLO_FECHADO` 409

## Fluxo

1. `$transaction`: `gerar_escala_mensal(id)`
2. Levantar a lista de colaboradores ativos sem âncora ou sem turno
3. Auditar `ESCALA_GERADA` com a contagem
4. Broadcast `escala:atualizada`

## ACID

**A:** geração + auditoria numa transação.
**I:** `FOR UPDATE` no ciclo dentro de `FN-002` serializa duas gerações simultâneas — a
segunda cria zero linhas.
**C:** `ON CONFLICT DO NOTHING` preserva ausências já lançadas (RN-05).

## CIA

**I:** `pulados` é essencial. Colaborador sem âncora sumiria da escala impressa e
ninguém notaria até o dia do plantão — a lista transforma um erro silencioso em aviso.
**D:** operação pesada (~1.500 linhas); roda fora da janela de marcação.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Primeira geração | linhas conforme âncoras |
| 2 | Segunda geração | `criados = 0` |
| 3 | Gerar → lançar `F` → regerar | `F` preservado |
| 4 | Colaborador sem âncora | aparece em `pulados` |
| 5 | Duas gerações concorrentes | sem duplicata |
| 6 | Ciclo fechado | 409 |
| 7 | Ago→set→out | paridade vira corretamente |
