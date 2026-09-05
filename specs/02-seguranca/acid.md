# ACID — garantias transacionais

- **ID:** SEC-ACID
- **Status:** PRONTA — **alteração exige revisão humana**
- **Pré-requisitos:** `01-dominio/blocos-jornada.md`
- **Entregáveis:** `src/server/db/tx.ts`, migrations de constraint, testes de concorrência

Leitura obrigatória para qualquer spec que escreva no banco.

---

## A — Atomicidade

### Regra

Toda mutação que toca mais de uma linha ou mais de uma tabela acontece em **uma** transação.
Não existe estado intermediário observável.

### Onde isso morde

`marcar_extra` insere em `marcacao` **e** incrementa `plantao.vagas_ocupadas`. Se a segunda
falhar, a vaga fica ocupada por ninguém — ou, pior, contada duas vezes. Por isso as duas
operações vivem dentro da função PL/pgSQL, que roda numa transação implícita.

### Padrões obrigatórios

```ts
// ✅ Uma transação, uma decisão
await prisma.$queryRaw`SELECT * FROM marcar_extra(${plantaoId}::uuid, ${colabId}::uuid, …)`;

// ❌ Proibido: compor estado com chamadas separadas
await prisma.marcacao.create(…);
await prisma.plantao.update({ data: { vagasOcupadas: { increment: 1 } } });
```

Quando a orquestração não couber numa função SQL, use `prisma.$transaction` com callback —
nunca o array form, que não permite ler o resultado de um passo para decidir o próximo.

```ts
await prisma.$transaction(async (tx) => { … }, {
  isolationLevel: 'ReadCommitted',
  timeout: 8_000,
  maxWait: 2_000,
});
```

### Efeitos colaterais fora do banco

Broadcast de Realtime, e-mail e log externo **nunca** dentro da transação. Se a transação der
rollback depois do broadcast, o cliente recebe evento de algo que não aconteceu. Padrão:
commit primeiro, efeito depois, com o resultado da transação em mãos.

### Fronteiras transacionais do sistema

| Operação | Fronteira | Nota |
|---|---|---|
| Marcar extra | `FN-005` | insert + increment + validações |
| Cancelar extra | `FN-006` | update + decrement |
| Gerar escala | `FN-002` | insert em massa idempotente |
| Ausência em lote | `API-ADM-ESC-003` | `$transaction` com callback |
| Criar plantões em lote | `API-ADM-PLA-002` | `$transaction`; tudo ou nada |
| Publicar ciclo | `API-ADM-CIC-005` | update de status + log |
| Login | `API-AUTH-002` | insert sessão + reset de falhas |

---

## C — Consistência

### Regra

Se dá para expressar como constraint declarativa, **é constraint**. A aplicação valida apenas
para dar mensagem melhor. Constraint é a rede que pega o que passou pela aplicação.

### Invariantes e como são garantidas

| Invariante | Mecanismo |
|---|---|
| `0 ≤ vagas_ocupadas ≤ vagas_totais` | `CHECK` |
| Uma marcação confirmada por (plantão, colaborador) | índice único parcial |
| Um registro de escala por (colaborador, data) | `UNIQUE` |
| Um plantão por (ciclo, rt, data, turno) | `UNIQUE` |
| `mes` entre 1 e 12 | `CHECK` |
| `limite_padrao ≥ 0` | `CHECK` |
| `max_blocos_seguidos` entre 1 e 3 | `CHECK` |
| `inicio_em < fim_em` | `CHECK` |
| Blocos de escala não se sobrepõem | `EXCLUDE USING gist` |
| Marcações do mesmo colaborador não se sobrepõem | `EXCLUDE USING gist` |
| Referências válidas | `FOREIGN KEY` com `ON DELETE` explícito |
| `codigo_escala` referenciado existe | `FOREIGN KEY` |

### Exclusion constraints

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE escala_dia ADD CONSTRAINT excl_escala_sobreposta
  EXCLUDE USING gist (
    colaborador_id WITH =,
    tstzrange(inicio_em, fim_em, '[)') WITH &&
  );

ALTER TABLE marcacao ADD CONSTRAINT excl_marcacao_sobreposta
  EXCLUDE USING gist (
    colaborador_id WITH =,
    (SELECT tstzrange(p.inicio_em, p.fim_em, '[)') FROM plantao p WHERE p.id = plantao_id) WITH &&
  ) WHERE (status = 'CONFIRMADA');
```

> ⚠️ **A segunda não funciona como escrita.** Exclusion constraint não aceita subquery.
> Solução adotada: **desnormalizar `inicio_em` e `fim_em` para dentro de `marcacao`**,
> copiados do plantão pelo mesmo trigger. Fica:
>
> ```sql
> ALTER TABLE marcacao ADD CONSTRAINT excl_marcacao_sobreposta
>   EXCLUDE USING gist (colaborador_id WITH =, tstzrange(inicio_em, fim_em, '[)') WITH &&)
>   WHERE (status = 'CONFIRMADA');
> ```
>
> Alterar horário de um plantão passa a exigir propagação para as marcações — tratado em
> `API-ADM-PLA-003`, dentro da mesma transação.

**Limitação conhecida e aceita:** exclusion constraint não cruza tabelas. Sobreposição
*entre* `escala_dia` e `marcacao` continua sendo verificada em `FN-004`, sob advisory lock.
Isso é uma decisão, não um esquecimento: a alternativa (tabela `ocupacao` unificada com
trigger de sincronia dos dois lados) foi avaliada e considerada mais frágil.

### O que não vira constraint

Regras que dependem de contagem ou de janela temporal — limite de extras no ciclo, jornada
máxima, janela de marcação. Essas vivem em `FN-005` com o isolamento descrito abaixo.

---

## I — Isolamento

### Ponto de partida

O padrão do Postgres é **READ COMMITTED**. Ele **não** protege padrões *read-then-write*, que
é exatamente o que o sistema faz o tempo todo:

```
1. SELECT count(*) → 3 extras usadas, limite 4     ← duas requisições leem 3
2. INSERT marcacao                                  ← as duas inserem
3. resultado: 5 extras                              ← limite estourado
```

### Anomalias mapeadas

| # | Anomalia | Cenário | Defesa |
|---|---|---|---|
| A1 | Última vaga vendida duas vezes | 2 colaboradores, 1 vaga | `SELECT … FOR UPDATE` no plantão |
| A2 | Limite estourado | mesmo colaborador, 2 abas, 2 plantões | `pg_advisory_xact_lock(colaborador)` |
| A3 | Jornada violada | mesmo colaborador marca blocos adjacentes simultâneos | idem A2 |
| A4 | Cancelar + marcar concorrentes | contador dessincroniza | `FOR UPDATE` no plantão nos dois caminhos |
| A5 | Ciclo fechado durante marcação | admin fecha enquanto grava | ler `ciclo` **dentro** da transação |
| A6 | Ausência lançada durante marcação | admin marca F enquanto colaborador marca extra | lock por colaborador nos dois caminhos |

### Estratégia escolhida

**Advisory lock por colaborador + row lock no plantão.** Não `SERIALIZABLE`.

Motivo: `SERIALIZABLE` exigiria retry em todo caller com tratamento de `40001`, e o pico de
contenção do sistema (abertura da janela) produziria abortos em cascata justamente no
momento de maior carga. O advisory lock serializa apenas o necessário — um colaborador por
vez — e a concorrência entre colaboradores distintos permanece total.

```sql
-- Sempre nesta ordem. Ver "Deadlock" abaixo.
PERFORM pg_advisory_xact_lock(hashtextextended(p_colaborador_id::text, 0));
SELECT * INTO v_plantao FROM plantao WHERE id = p_plantao_id FOR UPDATE;
```

**`pg_advisory_xact_lock`, nunca `pg_advisory_lock`.** O pooler roda em modo *transaction*
(`FUND-003`, D-02): a conexão volta ao pool no commit, então um lock de sessão vazaria para
outro cliente ou nunca seria liberado. A variante `_xact_` libera no fim da transação,
automaticamente, inclusive em rollback.

### Ordem de aquisição (prevenção de deadlock)

Toda função segue a mesma ordem, sem exceção:

```
1. advisory lock do colaborador   (hashtextextended do uuid)
2. row lock do plantão            (FOR UPDATE, por id crescente se forem vários)
3. leituras de ciclo, participacao, escala
4. escritas
```

Operações em lote que tocam vários colaboradores ordenam os IDs antes de travar. Duas
transações que peguem locks na mesma ordem não formam ciclo.

### `statement_timeout` e `lock_timeout`

```sql
ALTER ROLE app_server SET statement_timeout = '8s';
ALTER ROLE app_server SET lock_timeout = '3s';
ALTER ROLE app_server SET idle_in_transaction_session_timeout = '15s';
```

`lock_timeout` menor que `statement_timeout` para que espera por lock devolva erro
identificável (`55P03`) em vez de estourar o statement inteiro. O erro vira
`SISTEMA_OCUPADO` na API, com `Retry-After: 1` — não `500`.

### Idempotência

`POST /api/marcacoes` aceita header `Idempotency-Key`. Duplo clique, retry de rede e reenvio
do cliente não geram marcação dupla. Chave guardada em Redis por 24h com o resultado da
primeira execução; a segunda chamada devolve a mesma resposta e o mesmo status.

Independente disso, o índice único parcial em `marcacao` é a garantia final: mesmo sem chave,
a segunda inserção falha com `23505`, traduzido para `JA_MARCADO`.

---

## D — Durabilidade

| Item | Configuração |
|---|---|
| `synchronous_commit` | `on` — não abrimos mão para ganhar latência |
| `fsync` | `on` |
| PITR | habilitado, retenção 7 dias (plano Supabase) |
| Backup lógico diário | `pg_dump` cifrado, retenção 30 dias, bucket separado |
| RPO | 5 min |
| RTO | 4 h |
| Teste de restore | trimestral, em projeto isolado, com registro do tempo real |

**Backup não testado não é backup.** O teste trimestral restaura em projeto novo, roda a
suíte de `07-testes/` contra a base restaurada e registra o resultado em
`08-operacao/runbook-incidentes.md`.

### Reconciliação do contador

`vagas_ocupadas` é denormalizado (`FUND-003`, D-03). Durabilidade aqui significa também
*não confiar cegamente no contador*:

```sql
-- Job de 10 em 10 minutos. Divergência = alerta imediato, não correção silenciosa.
SELECT p.id, p.vagas_ocupadas, count(m.*) AS real
  FROM plantao p
  LEFT JOIN marcacao m ON m.plantao_id = p.id AND m.status = 'CONFIRMADA'
 GROUP BY p.id
HAVING p.vagas_ocupadas <> count(m.*);
```

Corrigir sozinho mascararia o bug que causou a divergência. O job alerta; a correção é
manual e investigada.

---

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| T1 | 20 requisições paralelas, plantão com 1 vaga | 1 sucesso, 19 `SEM_VAGA`, `vagas_ocupadas = 1` |
| T2 | Colaborador no limite − 1, 5 marcações paralelas em plantões distintos | 1 sucesso, 4 `LIMITE_ATINGIDO` |
| T3 | Marcações paralelas em blocos adjacentes formando 36h | uma passa, outra `EXCEDE_JORNADA` |
| T4 | Marcar + cancelar em paralelo no mesmo plantão | contador bate com a contagem real |
| T5 | Admin fecha ciclo durante marcação | `CICLO_FECHADO`, sem linha órfã |
| T6 | Mesmo `Idempotency-Key` 3× | 1 marcação, 3 respostas idênticas |
| T7 | Kill do processo entre insert e increment | rollback total, contador íntegro |
| T8 | Lock retido além de `lock_timeout` | `SISTEMA_OCUPADO` com `Retry-After` |
| T9 | Restore de PITR + suíte completa | verde |
| T10 | Detector de deadlock em 2h de carga sintética | zero deadlocks |
