# FN-007 — `plantoes_para_colaborador`

- **ID:** FN-007
- **Status:** PRONTA
- **Pré-requisitos:** `FN-004`, `FN-005`
- **Regras:** RN-18 a RN-22

Alimenta a grade de extras. Devolve **por que** cada plantão está indisponível — sem isso o
colaborador fica olhando célula cinza sem entender.

## Assinatura

```sql
plantoes_para_colaborador(p_ciclo_id uuid, p_colaborador_id uuid)
RETURNS TABLE (
  plantao_id uuid, data date, tipo turno, rt_codigo text,
  hora_inicio text, hora_fim text,
  vagas_totais int, vagas_ocupadas int,
  ja_marcado boolean, disponivel boolean, motivo text
) STABLE
```

`tipo` usa o enum `turno` (`DIURNO`/`NOTURNO`, mesmo enum de `plantao.tipo`) — não existe
`tipo_plantao`. `rt_codigo` é alimentado por `rt.nome` (única coluna de rótulo que `rt` tem
hoje — não existe coluna `rt.codigo` separada).

## Ordem dos motivos

**Idêntica à de `FN-005`.** Se divergirem, a UI mostra um motivo e a marcação recusa por
outro — o pior tipo de bug de confiança.

```
JA_MARCADO → CRUZADA_BLOQUEADA → EM_AUSENCIA → CONFLITO_DE_HORARIO
→ EXCEDE_JORNADA → LIMITE_ATINGIDO → SEM_VAGA → (disponível)
```

`SEM_VAGA` vem por último de propósito: saber que "estaria liberado, mas lotou" é mais útil
do que a célula sumir.

## Notas

- `EM_AUSENCIA` usa o mesmo critério de dois dias do passo 7 de `FN-005` (RN-16 estendida):
  para plantão `NOTURNO`, considera ausência tanto no dia do plantão quanto no dia seguinte
  (o turno cruza a meia-noite e "vaza" para a madrugada do dia seguinte); para `DIURNO`,
  continua checando só o próprio dia. As duas funções não podem divergir — este teste é
  F7-8.
- Retorna **todos** os plantões do ciclo, inclusive bloqueados. Esconder gera dúvida.
- Plantão de outra RT com cruzada desligada aparece com `motivo = 'CRUZADA_BLOQUEADA'`,
  em seção visualmente separada. O colaborador vê que existe e por que não pode.
- `LIMITE_ATINGIDO` é calculado uma vez, fora do laço.
- `STABLE`, sem efeito colateral. Cacheável por 5 s no edge (`SEC-DISP`).

## Desempenho

Chama `FN-004` por plantão (~50 no ciclo). Alvo p95 < 100 ms. Se não bater: carregar os
blocos ocupados do mês inteiro numa CTE e passar por parâmetro, em vez de re-consultar.
Otimizar **antes** de medir aqui é desperdício — o volume é pequeno.

## Consistência com a marcação

Este é um retrato do instante. Entre a leitura e o clique, outro colaborador pode ter pegado
a vaga. Por isso `FN-005` revalida tudo (`SEC-INT`). A UI trata `409` como resultado normal,
não como falha: mostra o motivo e recarrega a grade.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F7-1 | Colaborador sem restrição | todos disponíveis |
| F7-2 | No limite | todos `LIMITE_ATINGIDO` |
| F7-3 | Plantão lotado | `SEM_VAGA` |
| F7-4 | Outra RT, cruzada off | `CRUZADA_BLOQUEADA` |
| F7-5 | Mesmo turno do plantão base | `CONFLITO_DE_HORARIO` |
| F7-6 | Formaria 36h | `EXCEDE_JORNADA` |
| F7-7 | Já marcado | `ja_marcado = true` |
| F7-7b | Plantão NOTURNO na véspera de dia com ausência (D+1) | `EM_AUSENCIA` |
| F7-8 | Motivo aqui vs erro de `FN-005` | idênticos em 100 cenários |
| F7-9 | Ciclo com 50 plantões | < 100 ms |
