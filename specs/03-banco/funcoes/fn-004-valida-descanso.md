# FN-004 — `valida_descanso`

- **ID:** FN-004
- **Status:** PRONTA — **alteração exige revisão humana**
- **Pré-requisitos:** `01-dominio/blocos-jornada.md`, `FN-003`
- **Regras:** RN-12, RN-13, RN-14, RN-15, RN-17

Coração da regra de jornada. Erro aqui produz escala ilegal.

## Assinatura

```sql
valida_descanso(
  p_colaborador_id uuid, p_inicio timestamptz, p_fim timestamptz, p_max_blocos int
) RETURNS text STABLE
```

Retorna `NULL` (liberado), `'CONFLITO_DE_HORARIO'` ou `'EXCEDE_JORNADA'`.

## Implementação

Uma varredura, sem laço de queries.

```sql
CREATE OR REPLACE FUNCTION valida_descanso(
  p_colaborador_id uuid, p_inicio timestamptz, p_fim timestamptz, p_max_blocos int
) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_janela interval := ((p_max_blocos + 1) * 12) * interval '1 hour';
  v_b record; v_prev_fim timestamptz; v_corrida int := 1;
BEGIN
  -- 1. sobreposição (RN-13)
  IF EXISTS (
    SELECT 1 FROM blocos_ocupados(p_colaborador_id, p_inicio - v_janela, p_fim + v_janela)
     WHERE inicio_em < p_fim AND fim_em > p_inicio
  ) THEN RETURN 'CONFLITO_DE_HORARIO'; END IF;

  -- 2. cadeia contígua incluindo o bloco novo (RN-12)
  FOR v_b IN
    SELECT inicio_em, fim_em
      FROM (
        SELECT inicio_em, fim_em
          FROM blocos_ocupados(p_colaborador_id, p_inicio - v_janela, p_fim + v_janela)
        UNION ALL SELECT p_inicio, p_fim
      ) t ORDER BY inicio_em
  LOOP
    IF v_prev_fim IS NOT NULL AND v_b.inicio_em = v_prev_fim THEN
      v_corrida := v_corrida + 1;
      IF v_corrida > p_max_blocos THEN RETURN 'EXCEDE_JORNADA'; END IF;
    ELSE
      v_corrida := 1;
    END IF;
    v_prev_fim := v_b.fim_em;
  END LOOP;

  RETURN NULL;
END $$;
```

## Notas de projeto

**Janela derivada, não constante.** `(max_blocos + 1) * 12h`. Com `max_blocos = 2` dá 36h;
se algum dia subir para 3, a janela acompanha. Constante fixa de 36h quebraria em silêncio.

**Igualdade exata de timestamp** define contiguidade. Funciona porque os intervalos vêm todos
do mesmo trigger, com os mesmos horários. Se algum dia existir turno de horário quebrado
(ex.: 08:00–20:00), blocos deixam de ser contíguos e a regra afrouxa — nesse cenário, trocar
a igualdade por tolerância de `< 1 hora` e revisar esta spec.

**`STABLE`, não `VOLATILE`.** Só lê. Permite ao planejador reaproveitar dentro da query.

**Não é o único guardião.** A exclusion constraint de `marcacao` (`DB-002`) pega sobreposição
extra↔extra mesmo se esta função falhar. O que só existe aqui é sobreposição
escala↔extra e a cadeia contígua.

## Espelho em TypeScript

`src/lib/escala/blocos.ts` implementa a mesma lógica para a UI antecipar bloqueios.
Divergência é bug de severidade alta; `07-testes/paridade-escala.md` compara os dois com
1000 cenários gerados, em CI, bloqueando merge.

## Testes de aceitação

| # | Cenário | Esperado |
|---|---|---|
| F4-1 | Extra noturno D2, base noturno D2 | `CONFLITO_DE_HORARIO` |
| F4-2 | Extra diurno D2, base noturno D2 | `NULL` |
| F4-3 | Extra diurno D3, base noturno D2 | `NULL` |
| F4-4 | Base noturno D2 + extra diurno D2 + extra diurno D3 | `EXCEDE_JORNADA` |
| F4-5 | Dia com `FT` | `EXCEDE_JORNADA` se formar 3 |
| F4-6 | Dia com `F` | `NULL` |
| F4-7 | Blocos com 1h de folga entre eles | `NULL` |
| F4-8 | `max_blocos = 3` | 36h permitido, 48h não |
| F4-9 | Colaborador sem nenhum bloco | `NULL` |
| F4-10 | 1000 cenários vs TS | idêntico |
