# Disponibilidade

- **ID:** SEC-DISP
- **Status:** PRONTA — **alteração exige revisão humana**

O perfil de carga é atípico: 99% do mês é ocioso e existe **um pico agudo e previsível** na
abertura da janela de marcação, quando todo mundo tenta pegar o mesmo plantão bom ao mesmo
tempo. O sistema é dimensionado para esse minuto.

---

## Alvos

| Métrica | Alvo |
|---|---|
| Disponibilidade na janela | 99,9% |
| Disponibilidade fora da janela | 99,5% |
| p95 da grade de extras | < 400 ms |
| p95 da marcação | < 800 ms |
| p99 da marcação no pico | < 2 s |
| RPO / RTO | 5 min / 4 h |

## Rate limit

Duas finalidades distintas: conter abuso de credencial e conter avalanche legítima.

| Escopo | Limite | Ação |
|---|---|---|
| Login por matrícula | 5 falhas / 15 min | `bloqueadoAte = now() + 15 min` |
| Login por matrícula, acumulado | 10 falhas / 24 h | bloqueio até liberação manual |
| Login por IP | 20 tentativas / 15 min | `429` |
| Login por IP, acumulado | 100 / 24 h | `429` + alerta no dashboard |
| `POST /api/marcacoes` por sessão | 10 / min | `429` |
| Leitura autenticada por sessão | 120 / min | `429` |
| Global por IP | 300 / min | `429` |

`429` sempre com `Retry-After`. Bloqueio de conta é **temporário por padrão** — bloqueio
permanente automático transformaria o rate limit em vetor de negação de serviço contra
colegas, bastando errar o PIN de alguém cinco vezes.

Implementação: Upstash Redis, janela deslizante. **Se o Redis cair, o rate limit falha
fechado apenas no login** (segurança) e **falha aberto nas leituras** (disponibilidade).
Essa assimetria é deliberada.

## Thundering herd na abertura

Mitigações, em ordem de preferência:

1. **Abertura escalonada por RT.** RT1 às 08:00, RT2 às 08:15. Reduz o pico à metade com
   custo zero de engenharia.
2. **Jitter no cliente.** A tela de espera dispara o primeiro fetch com atraso aleatório de
   0–3 s. Sem isso, 150 clientes com o mesmo `setTimeout` batem no mesmo milissegundo.
3. **Grade servida com cache de 5 s** (`s-maxage=5, stale-while-revalidate=30`). A vaga exata
   chega por Realtime; a grade não precisa ser fresca ao milissegundo.
4. **Marcação nunca é cacheada.**

## Conexões

Pooler em modo *transaction*, `connection_limit=1` por instância serverless. Consequências
já registradas: nada de prepared statements de sessão, nada de `SET` de sessão, nada de
`pg_advisory_lock` não-transacional (`SEC-ACID`).

`idle_in_transaction_session_timeout = 15s` impede que uma transação esquecida aberta
segure conexão e lock indefinidamente — a falha mais comum de esgotar pool.

## Timeouts em cascata

```
cliente (15s) > rota Next (12s) > query (8s) > lock (3s)
```

Cada camada com timeout menor que a de fora. Invertido, o cliente desiste enquanto o banco
continua trabalhando, e a carga não cai quando os usuários param de esperar.

## Degradação graciosa

| Falha | Comportamento |
|---|---|
| Realtime indisponível | Fallback para polling de 15 s; banner discreto "atualização em modo lento" |
| Redis indisponível | Login falha fechado; leituras seguem sem rate limit |
| Banco em somente-leitura | Grade e escala funcionam; marcação responde `INDISPONIVEL_TEMPORARIAMENTE` |
| Um plantão corrompido | Erro isolado na célula; a grade renderiza o resto |
| Impressão de escala falha | Fallback para HTML imprimível pelo navegador |

Nunca tela branca. Toda falha tem estado visual e mensagem em português.

## Backup e recuperação

- PITR contínuo, retenção 7 dias
- `pg_dump` diário cifrado, retenção 30 dias, bucket em região distinta
- Restore testado trimestralmente com a suíte completa rodando contra a base restaurada
- Runbook em `08-operacao/runbook-incidentes.md`

## Manutenção

Migration com `ACCESS EXCLUSIVE LOCK` **nunca** durante a janela de marcação. Índice novo
com `CREATE INDEX CONCURRENTLY`. Janela de manutenção: terça, 03:00–05:00, fora de qualquer
ciclo aberto.

## Observabilidade mínima

| Sinal | Alerta |
|---|---|
| Taxa de erro 5xx | > 1% em 5 min |
| p95 da marcação | > 1,5 s em 5 min |
| Conexões em uso | > 80% do pool |
| Deadlocks | qualquer ocorrência |
| Divergência de `vagas_ocupadas` | qualquer ocorrência |
| Falha do job de expurgo | qualquer ocorrência |
| Lag do Realtime | > 5 s |

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| D1 | 150 clientes simultâneos na abertura | p99 < 2 s, zero 5xx |
| D2 | Redis derrubado durante o pico | leituras seguem; login recusa |
| D3 | Realtime derrubado | polling assume em ≤ 20 s |
| D4 | Banco em somente-leitura | leituras OK; marcação com erro claro |
| D5 | Transação deixada aberta | encerrada em 15 s, pool não esgota |
| D6 | 6 logins errados | bloqueio de 15 min, e expira sozinho |
| D7 | Restore de PITR | dentro do RTO de 4 h |
| D8 | Migration em CI com carga | sem lock acima de 1 s |
