-- ============================================================================
-- 006_indices — DB-004 (specs/03-banco/indices.md)
-- ============================================================================
-- SQL copiado literalmente do bloco `sql` de specs/03-banco/indices.md.
--
-- Sem `CREATE INDEX CONCURRENTLY` aqui, de propósito: `prisma migrate deploy`
-- roda cada migration dentro de uma transação (e esta migration, em
-- particular, roda contra uma base ainda vazia — não há linha para bloquear
-- nem consulta concorrente para travar). `CREATE INDEX CONCURRENTLY` não pode
-- rodar dentro de bloco de transação (erro do Postgres:
-- "CREATE INDEX CONCURRENTLY cannot run inside a transaction block"), então
-- usá-lo aqui quebraria a migration.
--
-- A regra "índice novo em produção sempre CREATE INDEX CONCURRENTLY"
-- (specs/03-banco/indices.md, seção "Regras", SEC-DISP) vale para quando um
-- índice for adicionado depois, contra uma base já populada e em uso — nesse
-- caso a criação deve ser feita manualmente (fora de `prisma migrate`, com
-- `pgbouncer`/pooler desviado para a conexão direta), não via este arquivo.
-- Ver specs/03-banco/indices.md, "Regras", e specs/00-fundacao/ambiente.md
-- (DIRECT_URL / DATABASE_URL) para a conexão a usar nesse cenário futuro.
-- ============================================================================

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
