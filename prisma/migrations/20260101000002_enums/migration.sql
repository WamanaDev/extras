-- ============================================================================
-- 002_enums — DB-005, DB-001 (specs/03-banco/modelo-dados.md, migrations.md)
-- ============================================================================
-- Espelha 1:1 os enums de prisma/schema.prisma (seção "Enums (002_enums)").
-- Qualquer mudança aqui exige mudança equivalente no schema.prisma, e
-- vice-versa (M1 — `prisma migrate diff` vazio).
-- ============================================================================

-- Turno de 12h. Diurno [07:00,19:00); noturno [19:00,07:00+1) — DOM-001/FUND-002.
-- Reaproveitado em colaborador.turno_padrao, troca_escala.turno e plantao.tipo.
CREATE TYPE turno AS ENUM ('DIURNO', 'NOTURNO');

-- Ciclo de vida da competência mensal — RN-25, API-ADM-CIC-005/006.
CREATE TYPE status_ciclo AS ENUM ('RASCUNHO', 'PUBLICADO', 'FECHADO');

-- Cancelamento é sempre UPDATE de status, nunca DELETE (SEC-CONF, API-COL-005).
CREATE TYPE status_marcacao AS ENUM ('CONFIRMADA', 'CANCELADA');

-- De onde veio a marcação — RN-27 (ADMIN pula só a checagem de janela).
CREATE TYPE origem_marcacao AS ENUM ('COLABORADOR', 'ADMIN');

-- Ator de uma ação auditada — SEC-AUD.
CREATE TYPE ator_tipo AS ENUM ('COLABORADOR', 'ADMIN');
