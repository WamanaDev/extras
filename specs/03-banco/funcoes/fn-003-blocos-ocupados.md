# FN-003 — `blocos_ocupados`

- **ID:** FN-003
- **Status:** PRONTA
- **Pré-requisitos:** `01-dominio/blocos-jornada.md`, `01-dominio/codigos-escala.md`
- **Regras:** RN-15

## Assinatura

```sql
blocos_ocupados(p_colaborador_id uuid, p_de timestamptz, p_ate timestamptz)
RETURNS TABLE (inicio_em timestamptz, fim_em timestamptz, origem text, referencia_id uuid)
STABLE
```

## Implementação

```sql
CREATE OR REPLACE FUNCTION blocos_ocupados(
  p_colaborador_id uuid, p_de timestamptz, p_ate timestamptz
) RETURNS TABLE (inicio_em timestamptz, fim_em timestamptz, origem text, referencia_id uuid)
LANGUAGE sql STABLE AS $$
  SELECT e.inicio_em, e.fim_em, 'ESCALA'::text, e.id
    FROM escala_dia e
    JOIN codigo_escala ce ON ce.codigo = e.codigo
   WHERE e.colaborador_id = p_colaborador_id
     AND (ce.presenca OR ce.ocupa_horario)
     AND e.inicio_em < p_ate AND e.fim_em > p_de
  UNION ALL
  SELECT m.inicio_em, m.fim_em, 'EXTRA'::text, m.id
    FROM marcacao m
   WHERE m.colaborador_id = p_colaborador_id
     AND m.status = 'CONFIRMADA'
     AND m.inicio_em < p_ate AND m.fim_em > p_de
  ORDER BY 1;
$$;
```

## O ponto sutil

O filtro é `ce.presenca OR ce.ocupa_horario`, não `ce.presenca`. `FT` e `FE` têm
`presenca = false` mas `ocupa_horario = true`: quem está em treinamento não cobre o plantão,
mas também não está descansando. Trocar esse `OR` por `AND` — ou esquecer o segundo termo —
libera 36h seguidas para quem está em treinamento. É o bug mais provável desta função.

`marcacao` usa as próprias colunas de intervalo (copiadas pelo trigger `FN-001`), sem join
com `plantao`. Isso mantém a consulta indexável por `idx_marcacao_ocupacao`.

`ORDER BY 1` porque `FN-004` depende de ordenação.

## Desempenho

Usa `idx_escala_ocupacao` e `idx_marcacao_ocupacao`. Alvo: < 10 ms com 15.000 linhas.
Chamada em laço por `FN-007` para o ciclo inteiro — se virar gargalo, a otimização é
materializar a janela do ciclo uma vez em CTE, não indexar mais.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F3-1 | Dia com código `D` | 1 bloco `ESCALA` |
| F3-2 | Dia com `F` | 0 blocos |
| F3-3 | Dia com `FT` | 1 bloco `ESCALA` |
| F3-4 | Dia com `FE` | 1 bloco `ESCALA` |
| F3-5 | Extra confirmada | 1 bloco `EXTRA` |
| F3-6 | Extra cancelada | 0 blocos |
| F3-7 | Bloco fora da janela | não retorna |
| F3-8 | Bloco parcialmente na janela | retorna |
| F3-9 | Ordenação | crescente por `inicio_em` |
