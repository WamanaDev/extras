# FN-002 — `gerar_escala_mensal`

- **ID:** FN-002
- **Status:** PRONTA
- **Pré-requisitos:** `01-dominio/escala-12x36.md`, `02-seguranca/acid.md`
- **Regras:** RN-02, RN-03, RN-04, RN-05

## Assinatura

```sql
gerar_escala_mensal(p_ciclo_id uuid) RETURNS int
```

Retorna o número de linhas criadas.

## Comportamento

Para cada colaborador ativo com âncora definida, insere uma linha em `escala_dia` para cada
dia do mês em que `((data − ancora) % periodo + periodo) % periodo = 0`, com código `D`.

A âncora aplicável é a da `troca_escala` mais recente com `vigencia_inicio <= data`, ou a do
cadastro se não houver troca. Isso faz uma troca no meio do mês produzir a escala correta
dos dois lados sem intervenção.

## Idempotência (RN-05)

`ON CONFLICT (colaborador_id, data) DO NOTHING`. Regerar **não** sobrescreve ausências já
lançadas — que é o caso de uso real: o admin gera, lança as folgas, descobre que faltou
cadastrar alguém, e regera.

Não use `DO UPDATE`: apagaria o trabalho manual do admin, silenciosamente.

## Implementação

```sql
CREATE OR REPLACE FUNCTION gerar_escala_mensal(p_ciclo_id uuid)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  v_ciclo ciclo%ROWTYPE; v_inicio date; v_fim date; v_criados int := 0;
BEGIN
  SELECT * INTO v_ciclo FROM ciclo WHERE id = p_ciclo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CICLO_INEXISTENTE'; END IF;
  IF v_ciclo.status = 'FECHADO' THEN RAISE EXCEPTION 'CICLO_FECHADO'; END IF;

  v_inicio := make_date(v_ciclo.ano, v_ciclo.mes, 1);
  v_fim := (v_inicio + interval '1 month - 1 day')::date;

  INSERT INTO escala_dia
    (id, ciclo_id, colaborador_id, data, turno, codigo, hora_inicio, hora_fim, inicio_em, fim_em)
  SELECT gen_random_uuid(), p_ciclo_id, c.id, d::date,
         COALESCE(t.turno, c.turno_padrao), 'D',
         c.escala_hora_inicio, c.escala_hora_fim,
         now(), now()                                   -- trigger FN-001 sobrescreve
    FROM colaborador c
    CROSS JOIN generate_series(v_inicio, v_fim, interval '1 day') d
    LEFT JOIN LATERAL (
      SELECT * FROM troca_escala te
       WHERE te.colaborador_id = c.id AND te.vigencia_inicio <= d::date
       ORDER BY te.vigencia_inicio DESC LIMIT 1
    ) t ON true
   WHERE c.ativo AND c.escala_ancora IS NOT NULL AND c.turno_padrao IS NOT NULL
     AND ((d::date - COALESCE(t.ancora, c.escala_ancora))
          % COALESCE(t.periodo, c.escala_periodo)
          + COALESCE(t.periodo, c.escala_periodo))
          % COALESCE(t.periodo, c.escala_periodo) = 0
  ON CONFLICT (colaborador_id, data) DO NOTHING;

  GET DIAGNOSTICS v_criados = ROW_COUNT;
  UPDATE ciclo SET escala_gerada_em = now() WHERE id = p_ciclo_id;
  RETURN v_criados;
END $$;
```

## ACID

- **A:** insert em massa + `UPDATE ciclo` na mesma transação. Falha parcial não existe.
- **C:** exclusion constraint de `escala_dia` recusa sobreposição; `ON CONFLICT` trata o
  caso de já existir.
- **I:** `FOR UPDATE` no ciclo serializa gerações concorrentes. Duas chamadas simultâneas:
  a segunda espera e insere zero linhas.
- **D:** operação registrada em `audit_log` como `ESCALA_GERADA` com a contagem.

## Erros

| Erro | Quando |
|---|---|
| `CICLO_INEXISTENTE` | id inválido |
| `CICLO_FECHADO` | ciclo já fechado |

Colaborador sem âncora é **silenciosamente pulado** — mas a rota `API-ADM-CIC-003` devolve a
lista de pulados para o admin. Silêncio total aqui seria armadilha: o admin não perceberia
que faltou alguém na escala impressa.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F2-1 | Âncora 01/08, gerar ago | 16 linhas (ímpares) |
| F2-2 | Mesma âncora, set | 15 linhas (pares) |
| F2-3 | Fev bissexto | 15 linhas; março começa em 2 |
| F2-4 | Gerar 2× | segunda cria 0 |
| F2-5 | Gerar, lançar F, regerar | F preservado |
| F2-6 | Troca vigente dia 15 | dias 1–14 âncora antiga, 15–30 nova |
| F2-7 | Colaborador sem âncora | pulado, sem erro |
| F2-8 | Duas gerações concorrentes | uma insere, outra 0, sem duplicata |
| F2-9 | Ciclo fechado | `CICLO_FECHADO` |
