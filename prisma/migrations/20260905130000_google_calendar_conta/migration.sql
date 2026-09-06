-- Aplicado manualmente via `prisma migrate deploy` (não `migrate dev`): o shadow
-- database usado por `migrate dev` falha com P3006 "publication supabase_realtime
-- does not exist" — mesmo padrão de 20260105000001_remove_cpf_colaborador e
-- 20260905120000_notificacoes_e_push.
--
-- `refresh_token_cifrado`: NUNCA o token em claro — AES-256-GCM via
-- `CALENDAR_TOKEN_KEY` (`src/server/integracoes/google-calendar.ts`). Precisa
-- ser reversível (a app chama a API do Google com o token de verdade), então
-- é cifrado, não hasheado como PIN/senha.
CREATE TABLE "google_calendar_conta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "colaborador_id" UUID NOT NULL,
    "refresh_token_cifrado" TEXT NOT NULL,
    "calendario_id" TEXT NOT NULL DEFAULT 'primary',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "google_calendar_conta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_calendar_conta_colaborador_id_key" ON "google_calendar_conta"("colaborador_id");

ALTER TABLE "google_calendar_conta" ADD CONSTRAINT "google_calendar_conta_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
