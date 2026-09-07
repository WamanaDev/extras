# FN-006 — `cancelar_extra`

- **ID:** FN-006
- **Status:** PRONTA
- **Pré-requisitos:** `02-seguranca/acid.md`, `FN-005`
- **Regras:** RN-24, RN-25

## Assinatura

```sql
cancelar_extra(
  p_marcacao_id uuid, p_ator_id uuid, p_ator_tipo text
) RETURNS marcacao
```

`p_ip`/`p_user_agent` não fazem parte da assinatura: `marcacao` não tem colunas `ip`/
`user_agent` (essa informação vive só em `audit_log`, gravado pelo chamador na mesma
transação — mesma decisão de `FN-005 marcar_extra`). A ordem/tipos batem exatamente com o
`ALTER FUNCTION`/`GRANT EXECUTE` de `02-seguranca/rls-policies.md`.

## Comportamento

`UPDATE status = 'CANCELADA'` — **nunca `DELETE`** (`SEC-CONF`: histórico é o produto, e
`app_server` não tem permissão de `DELETE` em `marcacao`). Decrementa `vagas_ocupadas`.

## Ordem

A mesma de `FN-005`, sem exceção: advisory lock do colaborador → `FOR UPDATE` no plantão.
Marcar e cancelar concorrentes que travassem em ordens diferentes formariam ciclo de deadlock.

```sql
PERFORM pg_advisory_xact_lock(hashtextextended(v_marc.colaborador_id::text, 0));
SELECT * INTO v_plantao FROM plantao WHERE id = v_marc.plantao_id FOR UPDATE;
```

## Regras

| Ator | Pode cancelar |
|---|---|
| Colaborador | própria marcação, ciclo `PUBLICADO`, antes de `fechamentoMarcacao` |
| Admin | qualquer marcação de ciclo não `FECHADO` |

Cancelar marcação já cancelada é **no-op idempotente** — retorna a linha, não levanta erro.
Duplo clique não deve produzir erro assustador nem decrementar duas vezes.

## Erros

| Erro | Quando |
|---|---|
| `MARCACAO_INEXISTENTE` | id inválido, ou colaborador tentando cancelar de terceiro |
| `JANELA_ENCERRADA` | colaborador após o fechamento |
| `CICLO_FECHADO` | ciclo fechado |

Colaborador tentando cancelar marcação de terceiro recebe `404`, não `403` — não vazamos a
existência da marcação alheia (`SEC-CONF`).

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F6-1 | Cancelamento normal | status `CANCELADA`, contador −1 |
| F6-2 | Cancelar 2× | idempotente, contador −1 apenas |
| F6-3 | Colaborador após fechamento | `JANELA_ENCERRADA` |
| F6-4 | Admin após fechamento | permitido |
| F6-5 | Ciclo fechado | `CICLO_FECHADO` |
| F6-6 | Cancelar + marcar em paralelo | contador bate com a contagem real |
| F6-7 | Remarcar após cancelar | permitido (índice único é parcial) |
| F6-8 | Marcação de terceiro | `MARCACAO_INEXISTENTE` |
