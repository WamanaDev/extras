# Constraints

- **ID:** DB-002
- **Status:** PRONTA — **alteração exige revisão humana**
- **Pré-requisitos:** `02-seguranca/acid.md`, `02-seguranca/integridade.md`

Constraint é a última linha. Se ela dispara em produção, uma camada acima falhou —
é incidente, não erro esperado.

## Únicas

```sql
-- Uma marcação confirmada por (plantão, colaborador). Cancelada não bloqueia remarcar.
CREATE UNIQUE INDEX marcacao_unica_confirmada
  ON marcacao (plantao_id, colaborador_id) WHERE status = 'CONFIRMADA';

CREATE UNIQUE INDEX escala_dia_unica ON escala_dia (colaborador_id, data);
CREATE UNIQUE INDEX plantao_unico ON plantao (ciclo_id, rt_id, data, tipo);
CREATE UNIQUE INDEX ciclo_unico ON ciclo (ano, mes);
CREATE UNIQUE INDEX participacao_unica ON participacao_ciclo (ciclo_id, colaborador_id);
CREATE UNIQUE INDEX colaborador_matricula ON colaborador (matricula);
CREATE UNIQUE INDEX sessao_token ON sessao_colaborador (token_hash);
```

## Checks

```sql
ALTER TABLE plantao
  ADD CONSTRAINT chk_vagas CHECK (vagas_ocupadas BETWEEN 0 AND vagas_totais),
  ADD CONSTRAINT chk_vagas_totais CHECK (vagas_totais > 0),
  ADD CONSTRAINT chk_intervalo CHECK (inicio_em < fim_em),
  ADD CONSTRAINT chk_carga CHECK (carga_horas BETWEEN 1 AND 24);

ALTER TABLE ciclo
  ADD CONSTRAINT chk_mes CHECK (mes BETWEEN 1 AND 12),
  ADD CONSTRAINT chk_ano CHECK (ano BETWEEN 2020 AND 2100),
  ADD CONSTRAINT chk_limite CHECK (limite_padrao >= 0),
  ADD CONSTRAINT chk_blocos CHECK (max_blocos_seguidos BETWEEN 1 AND 3),
  ADD CONSTRAINT chk_janela CHECK (
    abertura_marcacao IS NULL OR fechamento_marcacao IS NULL
    OR abertura_marcacao < fechamento_marcacao
  );

ALTER TABLE escala_dia
  ADD CONSTRAINT chk_intervalo_escala CHECK (inicio_em < fim_em);

ALTER TABLE colaborador
  ADD CONSTRAINT chk_periodo CHECK (escala_periodo BETWEEN 1 AND 7);

ALTER TABLE participacao_ciclo
  ADD CONSTRAINT chk_limite_override CHECK (limite_override IS NULL OR limite_override >= 0);

ALTER TABLE troca_escala
  ADD CONSTRAINT chk_periodo_troca CHECK (periodo BETWEEN 1 AND 7);
```

## Exclusion (sobreposição de intervalos)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE escala_dia ADD CONSTRAINT excl_escala_sobreposta
  EXCLUDE USING gist (colaborador_id WITH =, tstzrange(inicio_em, fim_em, '[)') WITH &&);

ALTER TABLE marcacao ADD CONSTRAINT excl_marcacao_sobreposta
  EXCLUDE USING gist (colaborador_id WITH =, tstzrange(inicio_em, fim_em, '[)') WITH &&)
  WHERE (status = 'CONFIRMADA');
```

Intervalo `[)` é obrigatório. Com `[]`, diurno `[07,19]` colidiria com noturno `[19,07]` e
todo turno adjacente seria recusado — quebrando `RN-14`.

**O que essas constraints não pegam:** sobreposição *entre* `escala_dia` e `marcacao`.
Exclusion constraint não cruza tabelas. Isso fica em `FN-004`, sob advisory lock. Decisão
registrada em `SEC-ACID`.

## Códigos de erro → API

| SQLSTATE | Constraint | Erro da API | HTTP |
|---|---|---|---|
| `23505` | `marcacao_unica_confirmada` | `JA_MARCADO` | 409 |
| `23P01` | `excl_marcacao_sobreposta` | `CONFLITO_DE_HORARIO` | 409 |
| `23P01` | `excl_escala_sobreposta` | `ESCALA_SOBREPOSTA` | 409 |
| `23514` | `chk_vagas` | `SEM_VAGA` | 409 |
| `23503` | qualquer FK | `REFERENCIA_INVALIDA` | 409 |
| `55P03` | `lock_timeout` | `SISTEMA_OCUPADO` | 503 |
| `40P01` | deadlock | `SISTEMA_OCUPADO` | 503 |

Mapeamento centralizado em `src/server/db/erros.ts`. Nenhum handler traduz SQLSTATE na mão.

## Testes de aceitação (pgTAP)

| # | Teste | Esperado |
|---|---|---|
| B1 | `vagas_ocupadas = vagas_totais + 1` | rejeitado |
| B2 | Duas marcações confirmadas iguais | rejeitado `23505` |
| B3 | Cancelar e remarcar o mesmo plantão | aceito |
| B4 | Escala diurna e noturna no mesmo dia, mesmo colaborador | aceito (contíguos, não sobrepostos) |
| B5 | Dois registros de escala com intervalos sobrepostos | rejeitado `23P01` |
| B6 | `mes = 13` | rejeitado |
| B7 | `abertura > fechamento` | rejeitado |
| B8 | Apagar `codigo_escala` em uso | rejeitado |
