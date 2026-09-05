-- ============================================================================
-- 003_tabelas — DB-001 (specs/03-banco/modelo-dados.md)
-- ============================================================================
-- Espelha 1:1 os models de prisma/schema.prisma. Ordem de criação respeita
-- dependência de FK (referenciada antes de referenciar).
--
-- Escopo deste agente (DB-001/DB-005): tabelas, colunas, tipos, PK, FK com
-- ON DELETE explícito, defaults simples. NÃO inclui (de propósito — MG-8,
-- ver header de prisma/schema.prisma):
--   - UNIQUE "de negócio" e CHECK        → 004_constraints, DB-002, Agente F
--   - EXCLUDE USING gist                 → 004_constraints (parte já pronta
--                                           da Onda 0, ver aquele arquivo)
--   - Triggers                           → 005_triggers, DB-003, Agente F
--   - Índices de performance             → 006_indices, DB-004, agente de índices
--
-- `audit_log` já nasce com `hash_anterior`/`hash` (a Onda 0 havia escrito
-- isso como ALTER TABLE separado, em
-- `20260101000005_sec_aud_audit_log_hash_chain`, antes de a tabela existir
-- neste repositório — ver header original citado abaixo). Mesclado aqui
-- porque é mais simples e correto a tabela já nascer completa; o ALTER
-- TABLE / IF NOT EXISTS não faz sentido para uma CREATE TABLE nova.
--
-- Fonte: specs/03-banco/modelo-dados.md; specs/02-seguranca/auditoria.md
-- (campos de audit_log); specs/02-seguranca/integridade.md (hash_anterior/hash).
-- Conteúdo original da Onda 0 preservado: comentários de coluna de
-- hash_anterior/hash e o índice `idx_audit_log_criado_em` (abaixo).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Referência
-- ----------------------------------------------------------------------------

CREATE TABLE rt (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      text NOT NULL,
  ativo     boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE codigo_escala (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        text NOT NULL,
  descricao     text NOT NULL,
  presenca      boolean NOT NULL,
  ocupa_horario boolean NOT NULL,
  remunerada    boolean NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  cor           text NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE codigo_escala IS
  'DOM-003: tabela, não enum — admin cadastra códigos novos sem deploy.';
COMMENT ON COLUMN codigo_escala.presenca IS
  'Esta pessoa cobre o plantão? (impressão, cobertura mínima da RT — DOM-003.4)';
COMMENT ON COLUMN codigo_escala.ocupa_horario IS
  'Esta pessoa está comprometida no intervalo? (regra de descanso — DOM-002)';

-- ----------------------------------------------------------------------------
-- Pessoas
-- ----------------------------------------------------------------------------

CREATE TABLE colaborador (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula           text NOT NULL,
  nome                text NOT NULL,

  -- Credenciais (SEC-CONF): CPF nunca em claro.
  cpf_hash            text NOT NULL,
  cpf_ultimos4        text NOT NULL,

  rt_id               uuid NOT NULL REFERENCES rt (id) ON DELETE RESTRICT,

  -- Escala base (DOM-001).
  turno_padrao        turno NOT NULL,
  escala_ancora       date NOT NULL,
  escala_periodo      int NOT NULL DEFAULT 2,
  escala_hora_inicio  time,
  escala_hora_fim     time,

  -- Autenticação própria (RN-29..34).
  pin_hash            text,
  precisa_trocar_pin  boolean NOT NULL DEFAULT true,
  pin_definido_em     timestamptz,
  tentativas_falhas   int NOT NULL DEFAULT 0,
  bloqueado_ate       timestamptz,

  ativo               boolean NOT NULL DEFAULT true,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN colaborador.cpf_hash IS 'argon2id + CPF_PEPPER. Nunca persistido em claro (SEC-CONF).';
COMMENT ON COLUMN colaborador.cpf_ultimos4 IS '4 dígitos, só para conferência visual do admin.';
COMMENT ON COLUMN colaborador.pin_hash IS 'argon2id + PIN_PEPPER. NULL até o primeiro acesso.';
COMMENT ON COLUMN colaborador.atualizado_em IS 'Tocado por trigger tocar_atualizado_em (DB-003) — aplicação não escreve aqui.';

CREATE TABLE troca_escala (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id   uuid NOT NULL REFERENCES colaborador (id) ON DELETE CASCADE,
  vigencia_inicio  date NOT NULL,
  turno            turno NOT NULL,
  ancora           date NOT NULL,
  periodo          int NOT NULL DEFAULT 2,
  motivo           text NOT NULL,
  -- uuid de auth.users (admin) — sem FK: admin não é tabela deste schema (FUND-003).
  criado_por_id    uuid,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE troca_escala IS
  'DOM-001: nunca se edita a âncora no lugar. Histórico com vigência (RN-03).';

-- ----------------------------------------------------------------------------
-- Ciclo / escala / plantão / marcação
-- ----------------------------------------------------------------------------

CREATE TABLE ciclo (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano                     int NOT NULL,
  mes                     int NOT NULL,
  status                  status_ciclo NOT NULL DEFAULT 'RASCUNHO',
  limite_padrao           int NOT NULL,
  permite_cruzada         boolean NOT NULL DEFAULT true,
  permite_extra_em_folga  boolean NOT NULL DEFAULT false,
  max_blocos_seguidos     int NOT NULL DEFAULT 2,
  abertura_marcacao       timestamptz,
  fechamento_marcacao     timestamptz,
  escala_gerada_em        timestamptz,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN ciclo.escala_gerada_em IS 'Preenchido por FN-002 (gerar_escala_mensal). Pré-condição de publicação.';
COMMENT ON COLUMN ciclo.atualizado_em IS 'Tocado por trigger tocar_atualizado_em (DB-003).';

CREATE TABLE escala_dia (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id    uuid NOT NULL REFERENCES colaborador (id) ON DELETE CASCADE,
  ciclo_id          uuid NOT NULL REFERENCES ciclo (id) ON DELETE CASCADE,
  codigo_escala_id  uuid NOT NULL REFERENCES codigo_escala (id) ON DELETE RESTRICT,

  data              date NOT NULL,
  hora_inicio       time,
  hora_fim          time,

  -- Calculado por trigger preencher_intervalo (DB-003) — nunca pela aplicação.
  inicio_em         timestamptz NOT NULL DEFAULT now(),
  fim_em            timestamptz NOT NULL DEFAULT now(),

  observacao        text,

  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN escala_dia.inicio_em IS 'Trigger preencher_intervalo (DB-003) — não escrever pela aplicação (SEC-INT).';
COMMENT ON COLUMN escala_dia.fim_em IS 'Trigger preencher_intervalo (DB-003) — não escrever pela aplicação (SEC-INT).';
COMMENT ON COLUMN escala_dia.observacao IS 'Restrito ao admin (SEC-CONF) — costuma conter informação de saúde.';

CREATE TABLE plantao (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id          uuid NOT NULL REFERENCES ciclo (id) ON DELETE CASCADE,
  rt_id             uuid NOT NULL REFERENCES rt (id) ON DELETE RESTRICT,

  data              date NOT NULL,
  tipo              turno NOT NULL,
  hora_inicio       time NOT NULL,
  hora_fim          time NOT NULL,

  -- Calculado por trigger preencher_intervalo (DB-003) — nunca pela aplicação.
  inicio_em         timestamptz NOT NULL DEFAULT now(),
  fim_em            timestamptz NOT NULL DEFAULT now(),

  carga_horas       int NOT NULL,

  vagas_totais      int NOT NULL,
  vagas_ocupadas    int NOT NULL DEFAULT 0,

  permite_cruzada   boolean,
  ativo             boolean NOT NULL DEFAULT true,
  observacao        text,

  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN plantao.vagas_ocupadas IS
  'Denormalizado (D-03): realtime sem expor marcacao. Reconciliado a cada 10min (SEC-INT).';
COMMENT ON COLUMN plantao.permite_cruzada IS 'NULL = herda do ciclo; distinto de false (API-ADM-PLA-001).';
COMMENT ON COLUMN plantao.ativo IS 'false em vez de DELETE — histórico de marcacao precisa apontar para plantão existente.';

CREATE TABLE marcacao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plantao_id      uuid NOT NULL REFERENCES plantao (id) ON DELETE CASCADE,
  colaborador_id  uuid NOT NULL REFERENCES colaborador (id) ON DELETE RESTRICT,
  status          status_marcacao NOT NULL DEFAULT 'CONFIRMADA',
  origem          origem_marcacao NOT NULL,

  cruzada         boolean NOT NULL,

  -- Copiado do plantão por trigger copiar_intervalo_marcacao (DB-003).
  inicio_em       timestamptz NOT NULL DEFAULT now(),
  fim_em          timestamptz NOT NULL DEFAULT now(),

  motivo          text,

  criado_em       timestamptz NOT NULL DEFAULT now(),
  cancelado_em    timestamptz
);

COMMENT ON COLUMN marcacao.cruzada IS
  'participacao → plantao → ciclo → false (RN-20). Gravado na inserção, nunca recalculado.';
COMMENT ON COLUMN marcacao.inicio_em IS 'Trigger copiar_intervalo_marcacao (DB-003) — necessário p/ exclusion constraint.';
COMMENT ON COLUMN marcacao.motivo IS 'Obrigatório quando origem = ADMIN (API-ADM-MAR-002).';

CREATE TABLE participacao_ciclo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id          uuid NOT NULL REFERENCES ciclo (id) ON DELETE CASCADE,
  colaborador_id    uuid NOT NULL REFERENCES colaborador (id) ON DELETE CASCADE,

  limite_override   int,
  permite_cruzada   boolean,
  bloqueado         boolean NOT NULL DEFAULT false,
  motivo            text,

  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN participacao_ciclo.limite_override IS 'NULL = herda ciclo.limite_padrao (RN-21).';
COMMENT ON COLUMN participacao_ciclo.motivo IS 'Obrigatório em bloqueio e em redução de limite (API-ADM-PAR-001).';

-- ----------------------------------------------------------------------------
-- Autenticação / auditoria
-- ----------------------------------------------------------------------------

CREATE TABLE sessao_colaborador (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES colaborador (id) ON DELETE CASCADE,
  token_hash      text NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  expira_em       timestamptz NOT NULL,
  revogada_em     timestamptz,
  ip              text,
  user_agent      text
);

COMMENT ON COLUMN sessao_colaborador.token_hash IS 'Só o SHA-256 do token de 32 bytes vai ao banco (SEC-CONF).';

CREATE TABLE tentativa_login (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid REFERENCES colaborador (id) ON DELETE SET NULL,
  matricula       text NOT NULL,
  sucesso         boolean NOT NULL,
  motivo          text,
  ip              text NOT NULL,
  user_agent      text,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN tentativa_login.colaborador_id IS 'SET NULL: tentativa pode ser de matrícula inexistente.';

CREATE TABLE audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ator_tipo      ator_tipo NOT NULL,
  ator_id        uuid,
  acao           text NOT NULL,
  entidade       text NOT NULL,
  entidade_id    uuid,
  payload        jsonb NOT NULL,
  ip             text,
  user_agent     text,
  request_id     text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  hash_anterior  text,
  hash           text NOT NULL
);

COMMENT ON TABLE audit_log IS 'SEC-AUD: append-only, retenção 5 anos. UPDATE/DELETE revogados de app_server em 008_roles_grants.';
COMMENT ON COLUMN audit_log.ator_id IS
  'uuid de colaborador ou de auth.users (admin) conforme ator_tipo — sem FK: sobrevive à remoção física e à anonimização pós-retenção (AUD-6).';
COMMENT ON COLUMN audit_log.entidade_id IS 'Polimórfico (aponta para linha de tabelas variadas) — sem FK de propósito.';
COMMENT ON COLUMN audit_log.hash_anterior IS
  'SEC-AUD/SEC-INT: hash da linha anterior na cadeia (NULL/GENESIS na primeira linha). Calculado em src/server/audit/hash-chain.ts, nunca no banco.';
COMMENT ON COLUMN audit_log.hash IS
  'SEC-AUD/SEC-INT: sha256(hash_anterior || id || ator_id || acao || entidade_id || payload::text || criado_em). Validado diariamente por src/server/audit/validar-cadeia.ts.';

-- Preservado de `20260101000005_sec_aud_audit_log_hash_chain` (Onda 0) — não é
-- parte de DB-004 (03-banco/indices.md), que é de outro agente; mantido aqui
-- por já ter sido implementado e por ser específico da cadeia de hash, não
-- dos índices de performance de leitura listados em indices.md.
CREATE INDEX idx_audit_log_criado_em ON audit_log (criado_em, id);
