-- ============================================================================
-- pacientes_tabelas — DB-006 (specs/03-banco/modelo-dados-pacientes.md)
-- ============================================================================
-- Módulo de cuidados com pacientes (FUND-005): paciente, agendamento
-- (consulta/saída), medicamento (catálogo), prescrição (receita) e
-- administração (checagem dupla: separar → conferir → administrar).
--
-- Aplicado manualmente via `prisma migrate deploy` (não `migrate dev`), mesmo
-- padrão de 20260905120000_notificacoes_e_push: o shadow database usado por
-- `migrate dev` falha com P3006 contra a publication `supabase_realtime`
-- criada pelo próprio Supabase fora do histórico de migrations.
--
-- Índices de FK incluídos aqui (não em migration separada) — mesmo padrão de
-- 20260905120000_notificacoes_e_push, que já indexa `colaborador_id` junto
-- com a tabela. `idx_...` livres (não-unicidade de negócio) vivem aqui;
-- unicidade/exclusion de negócio (DB-007) vão em pacientes_constraints.
--
-- Fonte: specs/03-banco/modelo-dados-pacientes.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

CREATE TYPE "status_paciente" AS ENUM ('ATIVO', 'INATIVO');
CREATE TYPE "tipo_agendamento" AS ENUM ('CONSULTA', 'SAIDA');
CREATE TYPE "status_agendamento" AS ENUM ('AGENDADO', 'CONFIRMADO', 'REALIZADO', 'CANCELADO', 'NAO_COMPARECEU');
CREATE TYPE "origem_agendamento" AS ENUM ('COLABORADOR', 'ADMIN');
CREATE TYPE "tipo_prescricao" AS ENUM ('REGULAR', 'PRN');
CREATE TYPE "duracao_prescricao" AS ENUM ('DEFINITIVA', 'TEMPORARIA');
CREATE TYPE "origem_prescricao" AS ENUM ('COLABORADOR', 'ADMIN');
CREATE TYPE "status_prescricao" AS ENUM ('ATIVA', 'SUSPENSA', 'ENCERRADA');
CREATE TYPE "status_administracao" AS ENUM (
  'PENDENTE', 'SEPARADO', 'CONFERIDO', 'DIVERGENTE', 'ADMINISTRADO', 'RECUSADO', 'NAO_ADMINISTRADO'
);

-- ----------------------------------------------------------------------------
-- paciente
-- ----------------------------------------------------------------------------

CREATE TABLE "paciente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rt_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "data_nascimento" DATE NOT NULL,
    "cpf" TEXT,
    "nome_responsavel" TEXT,
    "contato_responsavel" TEXT,
    "observacoes_clinicas" TEXT,
    "status" "status_paciente" NOT NULL DEFAULT 'ATIVO',
    "criado_por_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "paciente_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "paciente" ADD CONSTRAINT "paciente_rt_id_fkey"
  FOREIGN KEY ("rt_id") REFERENCES "rt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_paciente_rt" ON "paciente" ("rt_id", "status");

-- ----------------------------------------------------------------------------
-- agendamento
-- ----------------------------------------------------------------------------

CREATE TABLE "agendamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paciente_id" UUID NOT NULL,
    "rt_id" UUID NOT NULL,
    "tipo" "tipo_agendamento" NOT NULL,
    "titulo" TEXT NOT NULL,
    "local" TEXT,
    "inicio_em" TIMESTAMPTZ(6) NOT NULL,
    "fim_em" TIMESTAMPTZ(6) NOT NULL,
    "acompanhante_colaborador_id" UUID,
    "origem" "origem_agendamento" NOT NULL,
    "criado_por_colaborador_id" UUID,
    "criado_por_admin_id" UUID,
    "status" "status_agendamento" NOT NULL DEFAULT 'AGENDADO',
    "observacoes" TEXT,
    "motivo_cancelamento" TEXT,
    "cancelado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "agendamento_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agendamento" ADD CONSTRAINT "agendamento_paciente_id_fkey"
  FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agendamento" ADD CONSTRAINT "agendamento_rt_id_fkey"
  FOREIGN KEY ("rt_id") REFERENCES "rt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agendamento" ADD CONSTRAINT "agendamento_acompanhante_colaborador_id_fkey"
  FOREIGN KEY ("acompanhante_colaborador_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agendamento" ADD CONSTRAINT "agendamento_criado_por_colaborador_id_fkey"
  FOREIGN KEY ("criado_por_colaborador_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Calendário por RT + período (API-AGE-001, FN-013).
CREATE INDEX "idx_agendamento_rt_periodo" ON "agendamento" ("rt_id", "inicio_em");
CREATE INDEX "idx_agendamento_paciente" ON "agendamento" ("paciente_id", "inicio_em");

-- ----------------------------------------------------------------------------
-- medicamento (catálogo de referência)
-- ----------------------------------------------------------------------------

CREATE TABLE "medicamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "principio_ativo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "medicamento_pkey" PRIMARY KEY ("id")
);

-- ----------------------------------------------------------------------------
-- prescricao
-- ----------------------------------------------------------------------------

CREATE TABLE "prescricao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paciente_id" UUID NOT NULL,
    "medicamento_id" UUID NOT NULL,
    "tipo" "tipo_prescricao" NOT NULL,
    "duracao" "duracao_prescricao" NOT NULL,
    "dose" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "horarios" TEXT[] NOT NULL DEFAULT '{}',
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE,
    "prescrito_por" TEXT NOT NULL,
    "instrucoes" TEXT,
    "status" "status_prescricao" NOT NULL DEFAULT 'ATIVA',
    "origem" "origem_prescricao" NOT NULL,
    "criado_por_colaborador_id" UUID,
    "criado_por_admin_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "prescricao_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "prescricao" ADD CONSTRAINT "prescricao_paciente_id_fkey"
  FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prescricao" ADD CONSTRAINT "prescricao_medicamento_id_fkey"
  FOREIGN KEY ("medicamento_id") REFERENCES "medicamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prescricao" ADD CONSTRAINT "prescricao_criado_por_colaborador_id_fkey"
  FOREIGN KEY ("criado_por_colaborador_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_prescricao_paciente" ON "prescricao" ("paciente_id", "status");

-- ----------------------------------------------------------------------------
-- administracao_medicamento (checagem dupla — RNP-25)
-- ----------------------------------------------------------------------------

CREATE TABLE "administracao_medicamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prescricao_id" UUID NOT NULL,
    "horario_previsto" TIMESTAMPTZ(6),
    "status" "status_administracao" NOT NULL DEFAULT 'PENDENTE',
    "separado_por_id" UUID,
    "separado_em" TIMESTAMPTZ(6),
    "conferido_por_id" UUID,
    "conferido_em" TIMESTAMPTZ(6),
    "administrado_por_id" UUID,
    "administrado_em" TIMESTAMPTZ(6),
    "observacao" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "administracao_medicamento_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "administracao_medicamento" ADD CONSTRAINT "administracao_medicamento_prescricao_id_fkey"
  FOREIGN KEY ("prescricao_id") REFERENCES "prescricao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "administracao_medicamento" ADD CONSTRAINT "administracao_medicamento_separado_por_id_fkey"
  FOREIGN KEY ("separado_por_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "administracao_medicamento" ADD CONSTRAINT "administracao_medicamento_conferido_por_id_fkey"
  FOREIGN KEY ("conferido_por_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "administracao_medicamento" ADD CONSTRAINT "administracao_medicamento_administrado_por_id_fkey"
  FOREIGN KEY ("administrado_por_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MAR do paciente (API-MED-006) e fila de conferência (API-MED-007, FN-014).
CREATE INDEX "idx_administracao_prescricao" ON "administracao_medicamento" ("prescricao_id", "horario_previsto");
CREATE INDEX "idx_administracao_status" ON "administracao_medicamento" ("status", "horario_previsto");

-- ----------------------------------------------------------------------------
-- tocar_atualizado_em (DB-003) reaproveitado nas tabelas com atualizado_em.
-- A função já existe (005_triggers); só os triggers novos são criados aqui.
-- ----------------------------------------------------------------------------

CREATE TRIGGER "trg_paciente_atualizado_em" BEFORE UPDATE ON "paciente"
  FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();

CREATE TRIGGER "trg_agendamento_atualizado_em" BEFORE UPDATE ON "agendamento"
  FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();

CREATE TRIGGER "trg_prescricao_atualizado_em" BEFORE UPDATE ON "prescricao"
  FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();
