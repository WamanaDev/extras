-- ============================================================================
-- 012_codigo_escala_bloqueado — DOM-003.6 revisado (pedido do usuário)
-- ============================================================================
-- Antes só `D` era imutável (`CODIGO_IMUTAVEL` em codigos.ts). Pedido do
-- usuário: o conjunto fixo/padrão passa a ser D (Disponível), F (Folga) e FE
-- (renomeado de "Folga TRE" para "Férias") — esses três não podem ter flags
-- alteradas nem ser desativados/excluídos pelo admin. `FT` deixa de ser
-- especial: continua existindo como preset, mas agora é um código comum,
-- editável/desativável como qualquer código criado pelo admin.
--
-- `bloqueado` é coluna (não checagem por `codigo IN ('D','F','FE')` na
-- aplicação) porque `codigo_escala` é tabela, não enum (DOM-003) — o mesmo
-- motivo pelo qual presenca/ocupaHorario/remunerada já são colunas. Novo
-- código cadastrado pelo admin nasce sempre com `bloqueado = false`
-- (`DEFAULT false`); só os três seeds abaixo têm `true`, e a aplicação nunca
-- expõe um jeito de alterar essa coluna via API (só a migration/seed grava
-- nela).
-- ============================================================================

ALTER TABLE codigo_escala ADD COLUMN IF NOT EXISTS bloqueado boolean NOT NULL DEFAULT false;

UPDATE codigo_escala SET bloqueado = true WHERE id IN (
  '00000000-0000-4000-8000-000000000011', -- D
  '00000000-0000-4000-8000-000000000012', -- F
  '00000000-0000-4000-8000-000000000014'  -- FE
);

-- FE — renomeado de "Folga TRE" para "Férias" (pedido do usuário). Flags
-- (presenca/ocupaHorario/remunerada) mantidas — só o rótulo muda.
UPDATE codigo_escala SET descricao = 'Férias' WHERE id = '00000000-0000-4000-8000-000000000014';
