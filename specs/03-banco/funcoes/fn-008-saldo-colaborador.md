# FN-008 — `saldo_colaborador`

- **ID:** FN-008
- **Status:** PRONTA
- **Regras:** RN-20, RN-21

## Assinatura

```sql
saldo_colaborador(p_ciclo_id uuid, p_colaborador_id uuid)
RETURNS TABLE (
  limite int, usadas int, restantes int,
  permite_cruzada boolean, bloqueado boolean, motivo_bloqueio text
) STABLE
```

## Regras

```
limite         = COALESCE(participacao.limite_override, ciclo.limite_padrao)
usadas         = marcações CONFIRMADAS do colaborador em plantões do ciclo
restantes      = GREATEST(limite − usadas, 0)
permite_cruzada = COALESCE(participacao.permite_cruzada, ciclo.permite_cruzada, false)
```

`GREATEST(…, 0)` porque `usadas` pode superar `limite` legitimamente: o admin reduziu a cota
depois de marcações já feitas. Saldo negativo na UI seria confuso; as marcações existentes
permanecem válidas (não se desfaz o que já foi combinado).

`permite_cruzada` aqui ignora o override por plantão — é o valor geral do colaborador no
ciclo, para exibir no cabeçalho. O veredito por plantão vem de `FN-007`.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F8-1 | Sem `participacao` | usa `limitePadrao` |
| F8-2 | Com override | usa override |
| F8-3 | Limite reduzido abaixo do usado | `restantes = 0`, sem negativo |
| F8-4 | Marcações canceladas | não contam |
| F8-5 | Marcações de outro ciclo | não contam |
| F8-6 | Bloqueado | `bloqueado = true` + motivo |
