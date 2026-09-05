# SEC-ACID — testes de concorrência pendentes de execução real

Os testes T1–T10 de `specs/02-seguranca/acid.md` exigem Postgres real com
múltiplas conexões concorrentes (pool, advisory lock, `FOR UPDATE`, PITR). Este
ambiente de agente não tem acesso a uma instância Postgres/Supabase, então eles
**não foram executados** — apenas especificados aqui, prontos para implementar
como teste de integração assim que `03-banco/modelo-dados.md` e as funções
`FN-004`/`FN-005` existirem.

A lógica pura que pode ser isolada sem banco (ordenação de locks para evitar
deadlock, tradução de SQLSTATE) já está coberta por
`src/server/db/tx.test.ts`, que roda sem Postgres.

| # | Teste | Esperado | Pré-condição para rodar de verdade |
|---|---|---|---|
| T1 | 20 requisições paralelas, plantão com 1 vaga | 1 sucesso, 19 `SEM_VAGA`, `vagas_ocupadas = 1` | `FN-005` implementada (03-banco) |
| T2 | Colaborador no limite − 1, 5 marcações paralelas em plantões distintos | 1 sucesso, 4 `LIMITE_ATINGIDO` | idem |
| T3 | Marcações paralelas em blocos adjacentes formando 36h | uma passa, outra `EXCEDE_JORNADA` | `FN-004` implementada |
| T4 | Marcar + cancelar em paralelo no mesmo plantão | contador bate com a contagem real | `FN-005`/`FN-006` |
| T5 | Admin fecha ciclo durante marcação | `CICLO_FECHADO`, sem linha órfã | `FN-005`, `ciclo` |
| T6 | Mesmo `Idempotency-Key` 3× | 1 marcação, 3 respostas idênticas | rota `POST /api/marcacoes` + Redis |
| T7 | Kill do processo entre insert e increment | rollback total, contador íntegro | ambiente de teste com kill controlado |
| T8 | Lock retido além de `lock_timeout` | `SISTEMA_OCUPADO` com `Retry-After` | roles/timeouts da migration `sec_acid_extension_timeouts` aplicados |
| T9 | Restore de PITR + suíte completa | verde | projeto Supabase isolado, plano com PITR |
| T10 | Detector de deadlock em 2h de carga sintética | zero deadlocks | ferramenta de carga (k6/artillery) apontando para staging |

Recomendação de implementação futura: `vitest` com `testTimeout` alto, aviso
`describe.skipIf(!process.env.DATABASE_URL_TESTE)` e um `docker-compose` de
Postgres efêmero — o `docker-compose.dev.yml` já existente no repo é o ponto
de partida natural.
