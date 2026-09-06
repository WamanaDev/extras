# FN-014 — `alertas_medicamento`

- **ID:** FN-014
- **Status:** RASCUNHO
- **Pré-requisitos:** `03-banco/modelo-dados-pacientes.md`, `SEC-SAUDE`
- **Regras:** RNP-18

## Objetivo

Lista doses `PENDENTE` cujo `horario_previsto` já passou da tolerância — usado pela tela de MAR
(destaque visual) e pelo job que dispara notificação (`RT-003`, reaproveitando a tabela
`notificacao`/`push_subscription` já existentes no schema).

## Assinatura

```sql
alertas_medicamento(p_rt_id uuid, p_tolerancia_minutos int DEFAULT 30)
RETURNS TABLE (
  administracao_id uuid, prescricao_id uuid, paciente_id uuid, paciente_nome text,
  medicamento_nome text, horario_previsto timestamptz, minutos_atraso int
)
```

## Implementação

```sql
CREATE OR REPLACE FUNCTION alertas_medicamento(p_rt_id uuid, p_tolerancia_minutos int DEFAULT 30)
RETURNS TABLE (
  administracao_id uuid, prescricao_id uuid, paciente_id uuid, paciente_nome text,
  medicamento_nome text, horario_previsto timestamptz, minutos_atraso int
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT am.id, pr.id, pa.id, pa.nome, m.nome, am.horario_previsto,
         floor(extract(epoch FROM (now() - am.horario_previsto)) / 60)::int
    FROM administracao_medicamento am
    JOIN prescricao pr ON pr.id = am.prescricao_id
    JOIN paciente pa ON pa.id = pr.paciente_id
    JOIN medicamento m ON m.id = pr.medicamento_id
   WHERE pa.rt_id = p_rt_id
     AND am.status = 'PENDENTE'
     AND pr.status = 'ATIVA'
     AND am.horario_previsto < now() - make_interval(mins => p_tolerancia_minutos)
   ORDER BY am.horario_previsto;
$$;
```

`status = 'PENDENTE'` no registro **não muda** aqui — `ATRASADO` é um rótulo calculado na
consulta (`minutos_atraso > 0`), não um valor gravado por esta função (`RNP-18`: "sem mudar o
registro histórico até ação humana"). Quem resolve a dose ainda chama `FN-012`, que decide
`ADMINISTRADO`/`RECUSADO` a partir do estado real.

## Uso pelo job de notificação

Job periódico (a cada 5 min, `FUND-005` "Alerta de dose atrasada") chama esta função por RT,
para cada linha cria uma `notificacao` (tabela já existente, hoje sem gatilho de negócio — ver
comentário em `prisma/schema.prisma`) para os colaboradores lotados naquela RT, com título
genérico (`SEC-SAUDE` "Log e notificação") e `link` apontando para a tela de MAR do paciente.
Evitar duplicar notificação: job verifica se já existe `notificacao` não lida para o mesmo
`administracao_id` antes de criar outra.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F14-1 | Dose prevista há 45 min, tolerância 30 | aparece, `minutos_atraso ≈ 15` |
| F14-2 | Dose prevista há 10 min, tolerância 30 | não aparece |
| F14-3 | Dose já `ADMINISTRADO` | não aparece |
| F14-4 | Prescrição `SUSPENSA` com dose pendente antiga | não aparece |
| F14-5 | Job rodando duas vezes seguidas | não duplica notificação |
