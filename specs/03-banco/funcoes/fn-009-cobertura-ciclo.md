# FN-009 — `cobertura_ciclo`

- **ID:** FN-009
- **Status:** PRONTA
- **Regras:** DOM-003.4

## Assinatura

```sql
cobertura_ciclo(p_ciclo_id uuid)
RETURNS TABLE (data date, rt_codigo text, turno tipo_plantao,
               escalados int, extras int, total int, minimo int, deficit int)
STABLE
```

## Comportamento

Para cada (dia, RT, turno) do ciclo:

- `escalados` = `escala_dia` com código de `presenca = true`
- `extras` = marcações confirmadas em plantões daquele slot
- `deficit` = `GREATEST(minimo − total, 0)`

`minimo` vem da configuração da RT (`rt.cobertura_minima_diurno` / `_noturno`).

## Uso

Alimenta o dashboard e o alerta de cobertura. É o relatório que responde a pergunta que a
gestão faz de verdade: *"tem gente suficiente em todo dia do mês?"*

Ausências entram automaticamente: lançar `F` num dia derruba `escalados` e, se cruzar o
mínimo, o dia aparece com déficit sem ninguém precisar reconferir a planilha.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F9-1 | Dia completo | `deficit = 0` |
| F9-2 | Lançar `F` derrubando abaixo do mínimo | `deficit > 0` |
| F9-3 | Extra confirmada cobrindo o buraco | `deficit` volta a 0 |
| F9-4 | `FT` no dia | não conta como escalado (`presenca = false`) |
| F9-5 | Extra cancelada | não conta |
