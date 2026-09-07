# Índices

- **ID:** DB-004
- **Status:** PRONTA

```sql
-- Jornada: a consulta mais quente do sistema (FN-003)
CREATE INDEX idx_escala_ocupacao ON escala_dia (colaborador_id, inicio_em, fim_em);
CREATE INDEX idx_marcacao_ocupacao ON marcacao (colaborador_id, inicio_em, fim_em)
  WHERE status = 'CONFIRMADA';

-- Grade de extras (FN-007)
CREATE INDEX idx_plantao_ciclo_data ON plantao (ciclo_id, data, tipo) WHERE ativo;
CREATE INDEX idx_plantao_rt ON plantao (rt_id, data);

-- Escala mensal / impressão
CREATE INDEX idx_escala_ciclo ON escala_dia (ciclo_id, data);
CREATE INDEX idx_escala_colab_ciclo ON escala_dia (colaborador_id, ciclo_id);

-- Contagem de cota (FN-005, FN-008)
CREATE INDEX idx_marcacao_colab ON marcacao (colaborador_id, status);

-- Auth
CREATE INDEX idx_sessao_ativa ON sessao_colaborador (colaborador_id)
  WHERE revogada_em IS NULL;
CREATE INDEX idx_tentativa_matricula ON tentativa_login (matricula, criado_em DESC);
CREATE INDEX idx_tentativa_ip ON tentativa_login (ip, criado_em DESC);

-- Auditoria
CREATE INDEX idx_audit_entidade ON audit_log (entidade, entidade_id, criado_em DESC);
CREATE INDEX idx_audit_ator ON audit_log (ator_id, criado_em DESC);

-- Fila de cancelamento (API-ADM-MAR-004)
CREATE INDEX solicitacao_cancelamento_status_criado_em_idx
  ON solicitacao_cancelamento (status, criado_em);
CREATE INDEX solicitacao_cancelamento_colaborador_id_idx
  ON solicitacao_cancelamento (colaborador_id);
-- Único parcial (WHERE) em vez de `@@unique` no Prisma (não modela WHERE) —
-- nunca mais de um pedido PENDENTE por marcação; decisão final é do banco.
CREATE UNIQUE INDEX solicitacao_cancelamento_pendente_unica
  ON solicitacao_cancelamento (marcacao_id)
  WHERE status = 'PENDENTE';
```

Índices parciais (`WHERE`) reduzem tamanho e mantêm o índice quente nas linhas que
importam — marcações canceladas e plantões inativos nunca são consultados nos caminhos
críticos.

## Regras

- Índice novo em produção sempre `CREATE INDEX CONCURRENTLY` (`SEC-DISP`).
- Antes de adicionar, `EXPLAIN (ANALYZE, BUFFERS)` na query real com volume realista.
- Índice que não aparece em `pg_stat_user_indexes` após 60 dias é candidato a remoção.
- `SET enable_seqscan = off` só em investigação, jamais em código.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| X1 | `FN-003` com 15.000 linhas de escala | index scan, < 10 ms |
| X2 | `FN-007` para um ciclo completo | < 100 ms |
| X3 | Contagem de cota | index scan |
| X4 | Nenhum seq scan em tabela > 5.000 linhas nos caminhos críticos | sim |
