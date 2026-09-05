# Triggers

- **ID:** DB-003
- **Status:** PRONTA — **alteração exige revisão humana**

## `preencher_intervalo` — fonte única do cálculo temporal

A aplicação **nunca** escreve `inicio_em` / `fim_em`. Duas implementações do mesmo cálculo
divergem, e divergência aqui quebra silenciosamente a regra de jornada (`DOM-002`).

```sql
CREATE OR REPLACE FUNCTION preencher_intervalo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.inicio_em := (NEW.data + NEW.hora_inicio::time) AT TIME ZONE 'America/Sao_Paulo';
  NEW.fim_em := CASE
    WHEN NEW.hora_fim::time <= NEW.hora_inicio::time
      THEN (NEW.data + 1 + NEW.hora_fim::time) AT TIME ZONE 'America/Sao_Paulo'
      ELSE (NEW.data + NEW.hora_fim::time) AT TIME ZONE 'America/Sao_Paulo'
  END;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_plantao_intervalo BEFORE INSERT OR UPDATE OF data, hora_inicio, hora_fim
  ON plantao FOR EACH ROW EXECUTE FUNCTION preencher_intervalo();

CREATE TRIGGER trg_escala_intervalo BEFORE INSERT OR UPDATE OF data, hora_inicio, hora_fim
  ON escala_dia FOR EACH ROW EXECUTE FUNCTION preencher_intervalo();
```

`hora_fim <= hora_inicio` identifica o turno que cruza a meia-noite. Cobre 19→07 e também
19→19 (24h), se algum dia existir.

## `copiar_intervalo_marcacao`

`marcacao` precisa do intervalo próprio para a exclusion constraint (`DB-002`).

```sql
CREATE OR REPLACE FUNCTION copiar_intervalo_marcacao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT p.inicio_em, p.fim_em INTO NEW.inicio_em, NEW.fim_em
    FROM plantao p WHERE p.id = NEW.plantao_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_marcacao_intervalo BEFORE INSERT OR UPDATE OF plantao_id
  ON marcacao FOR EACH ROW EXECUTE FUNCTION copiar_intervalo_marcacao();
```

Alterar o horário de um plantão exige propagar para as marcações confirmadas **na mesma
transação** — responsabilidade de `API-ADM-PLA-003`, não deste trigger. Um trigger em
`plantao` que atualizasse `marcacao` esconderia a operação de quem lê o handler.

## `atualizado_em`

```sql
CREATE OR REPLACE FUNCTION tocar_atualizado_em() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.atualizado_em := now(); RETURN NEW; END $$;
```

Aplicado a `colaborador`, `ciclo`, `escala_dia`.

## O que deliberadamente NÃO é trigger

| Operação | Por quê |
|---|---|
| Incrementar `vagas_ocupadas` | Precisa acontecer sob o `FOR UPDATE` de `FN-005`, junto das demais validações. Em trigger, a ordem de lock fica implícita e o deadlock vira imprevisível. |
| Gravar `audit_log` | Precisa de IP, user-agent e `request_id`, que só existem na aplicação. |
| Validar jornada | Precisa ler duas tabelas sob advisory lock; trigger por linha faria isso N vezes em operação de lote. |
| Broadcast de Realtime | Efeito externo — só depois do commit (`SEC-ACID`). |

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| G1 | Inserir plantão noturno 19:00/07:00 em 04/09 | `fim_em` = 05/09 07:00−03 |
| G2 | Inserir diurno 07:00/19:00 | `fim_em` = mesmo dia 19:00−03 |
| G3 | Aplicação envia `inicio_em` errado | trigger sobrescreve |
| G4 | Alterar `data` do plantão | intervalo recalculado |
| G5 | Inserir marcação | intervalo copiado do plantão |
| G6 | Alterar apenas `observacao` | trigger de intervalo não dispara |
