-- Aplicado manualmente via `prisma migrate deploy` (não `migrate dev`): o shadow
-- database usado por `migrate dev` falha com P3006 "publication supabase_realtime
-- does not exist" (publication criada pelo próprio Supabase fora do histórico de
-- migrations) — mesmo padrão já usado em 20260105000001_remove_cpf_colaborador.
CREATE TABLE "notificacao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "colaborador_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "link" TEXT,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "lida_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notificacao_colaborador_id_lida_idx" ON "notificacao"("colaborador_id", "lida");

CREATE INDEX "notificacao_colaborador_id_criado_em_idx" ON "notificacao"("colaborador_id", "criado_em");

ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "push_subscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "colaborador_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");

ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
