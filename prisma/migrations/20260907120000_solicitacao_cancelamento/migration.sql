-- Aplicado manualmente via `prisma migrate deploy` (não `migrate dev`): o shadow
-- database usado por `migrate dev` falha com P3006 "publication supabase_realtime
-- does not exist" — mesmo padrão de 20260105000001_remove_cpf_colaborador,
-- 20260905120000_notificacoes_e_push e 20260905130000_google_calendar_conta.
--
-- Pedido do usuário: colaborador não cancela mais a própria extra direto —
-- abre um pedido (`solicitacao_cancelamento`), que QUALQUER admin (não um
-- específico) aprova ou recusa em `/admin/solicitacoes-cancelamento`. Aprovar
-- chama `cancelar_extra` (FN-006, já existente) com origem ADMIN — nenhuma
-- lógica de cancelamento nova, só quem tem permissão de acionar.

CREATE TYPE "status_solicitacao_cancelamento" AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA');

CREATE TABLE "solicitacao_cancelamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "marcacao_id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "status" "status_solicitacao_cancelamento" NOT NULL DEFAULT 'PENDENTE',
    "motivo_resolucao" TEXT,
    "resolvido_por_id" UUID,
    "resolvido_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "solicitacao_cancelamento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "solicitacao_cancelamento_status_criado_em_idx" ON "solicitacao_cancelamento"("status", "criado_em");
CREATE INDEX "solicitacao_cancelamento_colaborador_id_idx" ON "solicitacao_cancelamento"("colaborador_id");

-- Nunca mais de um pedido PENDENTE ao mesmo tempo pra mesma marcação — índice
-- único parcial (Prisma não modela `@@unique` com `WHERE` no schema; escrito
-- direto aqui, mesmo espírito de outros índices parciais já hand-rolled neste
-- projeto). Decisão final é do banco, não da aplicação (nunca confiar só no
-- `findFirst` de dedupe do serviço sob concorrência).
CREATE UNIQUE INDEX "solicitacao_cancelamento_pendente_unica"
  ON "solicitacao_cancelamento"("marcacao_id")
  WHERE "status" = 'PENDENTE';

ALTER TABLE "solicitacao_cancelamento" ADD CONSTRAINT "solicitacao_cancelamento_marcacao_id_fkey" FOREIGN KEY ("marcacao_id") REFERENCES "marcacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "solicitacao_cancelamento" ADD CONSTRAINT "solicitacao_cancelamento_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
