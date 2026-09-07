# FN-014 — `alertas_medicamento`

- **ID:** FN-014
- **Status:** RASCUNHO
- **Pré-requisitos:** `03-banco/modelo-dados-pacientes.md`, `SEC-SAUDE`
- **Regras:** RNP-18

## Objetivo

Lista doses paradas além da tolerância em qualquer etapa da checagem dupla — `PENDENTE` (nem
começou a ser separada) ou `SEPARADO` (separada, mas ninguém conferiu ainda). Usado pela tela de
MAR (destaque visual) e pelo job que dispara notificação (`RT-003`, reaproveitando a tabela
`notificacao`/`push_subscription` já existentes no schema).

## Assinatura

```sql
alertas_medicamento(p_rt_id uuid, p_tolerancia_minutos int DEFAULT 30)
RETURNS TABLE (
  administracao_id uuid, prescricao_id uuid, paciente_id uuid, paciente_nome text,
  medicamento_nome text, horario_previsto timestamptz, etapa_parada status_administracao,
  minutos_atraso int
)
```

## Implementação

```sql
CREATE OR REPLACE FUNCTION alertas_medicamento(p_rt_id uuid, p_tolerancia_minutos int DEFAULT 30)
RETURNS TABLE (
  administracao_id uuid, prescricao_id uuid, paciente_id uuid, paciente_nome text,
  medicamento_nome text, horario_previsto timestamptz, etapa_parada status_administracao,
  minutos_atraso int
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT am.id, pr.id, pa.id, pa.nome, m.nome, am.horario_previsto, am.status,
         floor(extract(epoch FROM (
           now() - COALESCE(am.separado_em, am.horario_previsto)
         )) / 60)::int
    FROM administracao_medicamento am
    JOIN prescricao pr ON pr.id = am.prescricao_id
    JOIN paciente pa ON pa.id = pr.paciente_id
    JOIN medicamento m ON m.id = pr.medicamento_id
   WHERE pa.rt_id = p_rt_id
     AND am.status IN ('PENDENTE', 'SEPARADO')
     AND pr.status = 'ATIVA'
     AND COALESCE(am.separado_em, am.horario_previsto)
         < now() - make_interval(mins => p_tolerancia_minutos)
   ORDER BY am.horario_previsto NULLS LAST, am.separado_em;
$$;
```

Duas leituras do relógio de atraso, conforme a etapa parada: se ainda `PENDENTE`, conta do
`horario_previsto` (ninguém separou a tempo); se `SEPARADO`, conta do `separado_em` (foi
separada, mas a conferência não veio) — uma dose separada há 40 min sem conferir é tão grave
quanto uma dose nunca separada, e o alerta trata as duas.

`status` **não muda** aqui — `ATRASADO` é um rótulo calculado na consulta, não um valor gravado
por esta função (`RNP-18`: "sem mudar o registro histórico até ação humana"). Quem resolve a
dose ainda chama `FN-012`/`FN-015`/`FN-016`, que decidem o próximo estado a partir do real.

## Uso pelo job de notificação

Job periódico (a cada 5 min, `FUND-005` "Alerta de dose atrasada") chama esta função por RT,
para cada linha cria uma `notificacao` (tabela já existente, hoje sem gatilho de negócio — ver
comentário em `prisma/schema.prisma`) para os colaboradores lotados naquela RT, com título
genérico (`SEC-SAUDE` "Log e notificação" — nunca menciona a etapa parada em detalhe, só
"Você tem uma pendência de medicação") e `link` apontando para a tela de MAR do paciente.
Evitar duplicar notificação: job verifica se já existe `notificacao` não lida para o mesmo
`administracao_id` antes de criar outra.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F14-1 | Dose `PENDENTE` prevista há 45 min, tolerância 30 | aparece, `etapa_parada = PENDENTE`, `minutos_atraso ≈ 15` |
| F14-2 | Dose `SEPARADO` há 40 min, tolerância 30 | aparece, `etapa_parada = SEPARADO`, `minutos_atraso ≈ 10` |
| F14-3 | Dose `PENDENTE` há 10 min, tolerância 30 | não aparece |
| F14-4 | Dose já `CONFERIDO` ou `ADMINISTRADO` | não aparece |
| F14-5 | Prescrição `SUSPENSA` com dose pendente antiga | não aparece |
| F14-6 | Job rodando duas vezes seguidas | não duplica notificação |
