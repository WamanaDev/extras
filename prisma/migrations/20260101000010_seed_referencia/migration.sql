-- ============================================================================
-- 010_seed_referencia — DB-005 (specs/03-banco/migrations.md, seção "Seed")
-- ============================================================================
-- Seed de dados de REFERÊNCIA puros (determinísticos, iguais em todo
-- ambiente): RT1, RT2 e os quatro códigos-base de escala (D/F/FT/FE —
-- DOM-003). Não cria admin nem colaborador — isso é `prisma/seed.ts`
-- (precisa de argon2 e, no caso do admin, da Auth Admin API do Supabase;
-- não é SQL puro, ver `03-banco/migrations.md`, seção "Seed").
--
-- Idempotência: como `004_constraints` (DB-002, escopo do Agente F) ainda
-- não adicionou UNIQUE a `rt.nome`/`codigo_escala.codigo`, este INSERT não
-- pode usar `ON CONFLICT`. Em vez disso, usa ids fixos (determinísticos) e
-- `WHERE NOT EXISTS (... WHERE id = ...)` — reaplicar esta migration (ou
-- rodar `prisma/seed.ts` sobre o mesmo id) é seguro. `prisma/seed.ts` usa os
-- MESMOS ids fixos abaixo via `prisma.rt.upsert({ where: { id } })` /
-- `prisma.codigoEscala.upsert({ where: { id } })`, que funciona por chave
-- primária independente de UNIQUE adicional.
--
-- Valores de presenca/ocupaHorario/remunerada/cor: espelham exatamente
-- `CODIGOS_BASE` em src/lib/escala/codigos.ts (fonte da verdade TS —
-- DOM-003), na mesma ordem de flags. Resolve o item 1 de `_conflitos.md`
-- (seed de codigo_escala dependia de tabela que não existia).
--
-- Fonte: specs/03-banco/migrations.md ("Seed"); specs/01-dominio/codigos-escala.md;
-- src/lib/escala/codigos.ts.
-- ============================================================================

INSERT INTO rt (id, nome, ativo)
SELECT '00000000-0000-4000-8000-000000000001', 'RT1', true
WHERE NOT EXISTS (SELECT 1 FROM rt WHERE id = '00000000-0000-4000-8000-000000000001');

INSERT INTO rt (id, nome, ativo)
SELECT '00000000-0000-4000-8000-000000000002', 'RT2', true
WHERE NOT EXISTS (SELECT 1 FROM rt WHERE id = '00000000-0000-4000-8000-000000000002');

-- D — Disponível. Código imutável do sistema (CODIGO_IMUTAVEL em codigos.ts, DOM-003.6).
INSERT INTO codigo_escala (id, codigo, descricao, presenca, ocupa_horario, remunerada, ativo, cor)
SELECT '00000000-0000-4000-8000-000000000011', 'D', 'Disponível', true, true, true, true, '#2E7D32'
WHERE NOT EXISTS (SELECT 1 FROM codigo_escala WHERE id = '00000000-0000-4000-8000-000000000011');

-- F — Folga. `remunerada = false` por padrão (spec: "conforme regra" — ajustável
-- pelo admin por política de ausência, não constante de domínio).
INSERT INTO codigo_escala (id, codigo, descricao, presenca, ocupa_horario, remunerada, ativo, cor)
SELECT '00000000-0000-4000-8000-000000000012', 'F', 'Folga', false, false, false, true, '#616161'
WHERE NOT EXISTS (SELECT 1 FROM codigo_escala WHERE id = '00000000-0000-4000-8000-000000000012');

-- FT — Folga Treinamento. Não cobre o plantão, mas ocupa o intervalo (não pode
-- encadear 24h de extra em volta).
INSERT INTO codigo_escala (id, codigo, descricao, presenca, ocupa_horario, remunerada, ativo, cor)
SELECT '00000000-0000-4000-8000-000000000013', 'FT', 'Folga Treinamento', false, true, true, true, '#1565C0'
WHERE NOT EXISTS (SELECT 1 FROM codigo_escala WHERE id = '00000000-0000-4000-8000-000000000013');

-- FE — Folga TRE.
INSERT INTO codigo_escala (id, codigo, descricao, presenca, ocupa_horario, remunerada, ativo, cor)
SELECT '00000000-0000-4000-8000-000000000014', 'FE', 'Folga TRE', false, true, true, true, '#6A1B9A'
WHERE NOT EXISTS (SELECT 1 FROM codigo_escala WHERE id = '00000000-0000-4000-8000-000000000014');
