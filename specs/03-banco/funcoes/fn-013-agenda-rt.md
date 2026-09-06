# FN-013 — `agenda_rt`

- **ID:** FN-013
- **Status:** RASCUNHO
- **Pré-requisitos:** `03-banco/modelo-dados-pacientes.md`
- **Regras:** RNP-01

## Objetivo

Consulta única para o calendário de agendamentos de uma RT em um período — evita N+1 de
paciente/acompanhante na tela de agenda (`API-AGE-001`).

## Assinatura

```sql
agenda_rt(p_rt_id uuid, p_de date, p_ate date)
RETURNS TABLE (
  agendamento_id uuid, paciente_id uuid, paciente_nome text, tipo tipo_agendamento,
  titulo text, local text, inicio_em timestamptz, fim_em timestamptz,
  status status_agendamento, acompanhante_nome text
)
```

## Implementação

```sql
CREATE OR REPLACE FUNCTION agenda_rt(p_rt_id uuid, p_de date, p_ate date)
RETURNS TABLE (
  agendamento_id uuid, paciente_id uuid, paciente_nome text, tipo tipo_agendamento,
  titulo text, local text, inicio_em timestamptz, fim_em timestamptz,
  status status_agendamento, acompanhante_nome text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT a.id, a.paciente_id, p.nome, a.tipo, a.titulo, a.local,
         a.inicio_em, a.fim_em, a.status, c.nome
    FROM agendamento a
    JOIN paciente p ON p.id = a.paciente_id
    LEFT JOIN colaborador c ON c.id = a.acompanhante_colaborador_id
   WHERE a.rt_id = p_rt_id
     AND a.inicio_em < (p_ate + 1)::timestamptz
     AND a.fim_em >= p_de::timestamptz
   ORDER BY a.inicio_em;
$$;
```

`SECURITY INVOKER` (padrão, `SEC-RLS`) — esta função só lê, não precisa elevar privilégio. O
filtro por `rt_id` é o parâmetro; a rota (`API-AGE-001`) sempre passa a RT do colaborador
autenticado, nunca aceita `rtId` livre do cliente (`RNP-01`, `API-000` "Ator").

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| F13-1 | Agendamento com `inicio_em` dentro do período | aparece |
| F13-2 | Agendamento que começa antes e termina dentro do período | aparece (overlap parcial) |
| F13-3 | Agendamento de outra RT | não aparece |
| F13-4 | Sem acompanhante | `acompanhante_nome` nulo, sem erro |
