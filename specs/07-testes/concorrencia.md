# Testes de concorrência

- **ID:** TST-002
- **Status:** PRONTA — **alteração exige revisão humana**
- **Pré-requisitos:** `02-seguranca/acid.md`

As regras mais importantes do sistema só quebram sob concorrência. Teste sequencial passa e
esconde a falha.

## Cenários

| # | Cenário | Setup | Esperado |
|---|---|---|---|
| C1 | Última vaga | 1 vaga, 20 requisições paralelas | 1× 201, 19× `SEM_VAGA`, contador = 1 |
| C2 | Limite | limite 4, 3 usadas, 5 paralelas em plantões distintos | 1 sucesso, 4× `LIMITE_ATINGIDO` |
| C3 | Jornada | 2 blocos adjacentes, 2 paralelas formando 36h | 1 sucesso, 1× `EXCEDE_JORNADA` |
| C4 | Marcar + cancelar | 10 marcações e 10 cancelamentos entrelaçados | contador = contagem real |
| C5 | Fechar durante marcação | fechar ciclo com 20 marcações em voo | nenhuma linha órfã |
| C6 | Ausência durante marcação | admin lança `FT` enquanto colaborador marca adjacente | serializado, sem violação de jornada |
| C7 | Alterar plantão + marcar | `PATCH` de horário com marcações em voo | sem deadlock, intervalos coerentes |
| C8 | Lotes com interseção | dois `API-ADM-PAR-002` com colaboradores em comum | sem deadlock |
| C9 | Idempotência | mesma chave, 5 paralelas | 1 marcação, 5 respostas iguais |
| C10 | Carga sustentada | 150 clientes, 2 min, mix realista | zero deadlocks, p99 < 2 s |

C6 e C7 são os que costumam faltar em suíte de concorrência, porque envolvem dois atores
diferentes. São exatamente as anomalias A6 e a inversão de ordem de lock de `SEC-ACID`.

## Método

- Postgres real, nunca mock
- `Promise.all` com pool próprio, sem pooler serverless no meio
- Cada cenário roda **20 vezes**; uma falha em 20 é falha
- Após cada cenário, verificar os invariantes:

```sql
-- 1. contador bate
SELECT 1 FROM plantao p LEFT JOIN marcacao m
  ON m.plantao_id = p.id AND m.status = 'CONFIRMADA'
 GROUP BY p.id HAVING p.vagas_ocupadas <> count(m.*);

-- 2. ninguém acima do limite
-- 3. ninguém com cadeia > max_blocos
-- 4. nenhuma sobreposição escala × extra
```

As quatro devem retornar zero linhas. Rodá-las ao fim de **todo** cenário, não só dos que
parecem relacionados — é assim que se descobre que o teste de vagas quebrou a jornada.

## Deadlock

`log_lock_waits = on`, `deadlock_timeout = 1s` no ambiente de teste. Qualquer deadlock em
`pg_stat_database.deadlocks` ao fim da suíte falha o build.
