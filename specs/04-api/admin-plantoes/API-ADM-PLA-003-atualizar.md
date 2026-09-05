# API-ADM-PLA-003 — `PATCH /api/admin/plantoes/:id`

- **ID:** API-ADM-PLA-003
- **Status:** PRONTA — **alteração exige revisão humana**
- **Ator:** Admin
- **Pré-requisitos:** `03-banco/triggers.md`, `DB-002`
- **Entregáveis:** `src/app/api/admin/plantoes/[id]/route.ts`

## Objetivo

Altera vagas, horário ou flag de cruzada de um plantão.

## Contrato

### Request
```ts
{ vagasTotais?, horaInicio?, horaFim?, permiteCruzada?, observacao?, confirmarImpacto? }
```

### Erros
`VAGAS_MENOR_QUE_OCUPADAS` 409 · `IMPACTO_NAO_CONFIRMADO` 409 · `EXCEDE_JORNADA` 409 · `CICLO_FECHADO` 409

## Fluxo

1. `SELECT ... FOR UPDATE` no plantão
2. `vagasTotais < vagasOcupadas` → 409 (RN-26)
3. **Se o horário mudar:**
   a. advisory lock de cada colaborador com marcação confirmada, em ordem crescente de id
   b. propagar `inicioEm`/`fimEm` para as marcações **na mesma transação**
   c. revalidar a jornada de cada um; se algum violar, 409 com a lista
4. Aplicar, auditar antes → depois
5. Broadcast

## ACID

**A:** plantão e marcações atualizados juntos. Intervalo do plantão divergindo do
intervalo copiado nas marcações quebraria a exclusion constraint e a regra de jornada de
forma silenciosa.
**I:** ordem de lock — plantão, depois colaboradores em ordem crescente de id. Nunca o
inverso: `FN-005` trava colaborador antes de plantão, e cruzar as ordens forma deadlock.

> ⚠️ Este é o **único** ponto do sistema onde a ordem de locks difere de `FN-005`. Justamente
> por isso os locks de colaborador aqui são adquiridos com `pg_try_advisory_xact_lock` em
> laço com backoff; se algum não vier em 3 s, a operação aborta com `SISTEMA_OCUPADO` em vez
> de esperar e formar ciclo.

## CIA

**I:** propagação de horário é o caminho mais provável para corromper a integridade
temporal. Alterar horário de plantão com marcações é operação rara e cara — a UI deve
sugerir criar plantão novo e cancelar o antigo.
**D:** operação com múltiplos locks; proibida durante a janela de marcação.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Aumentar vagas | aplicado |
| 2 | Reduzir abaixo das ocupadas | 409 |
| 3 | Alterar horário sem marcações | aplicado |
| 4 | Alterar horário com marcações | intervalos propagados |
| 5 | Alteração criando 36h para alguém | 409 com a lista |
| 6 | Concorrente com marcação | sem deadlock |
| 7 | Lock indisponível em 3 s | `SISTEMA_OCUPADO` |
| 8 | Intervalo de `marcacao` vs `plantao` após update | idênticos |
