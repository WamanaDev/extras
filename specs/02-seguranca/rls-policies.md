# Políticas RLS

- **ID:** SEC-RLS
- **Status:** PRONTA — **alteração exige revisão humana**
- **Entregáveis:** migration de RLS + testes pgTAP

## Princípio

`ENABLE` + `FORCE ROW LEVEL SECURITY` em **todas** as tabelas. Sem policy = sem acesso.
Nada de tabela "esquecida" aberta.

```sql
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
```

## Contexto

O colaborador **não** usa Supabase Auth, então `auth.uid()` não o identifica. Toda escrita
passa pelo backend Next com `service_role`, que ignora RLS. A RLS aqui é **defesa em
profundidade**, não o controle primário — o controle primário é a autorização de aplicação
(`SEC-INT`). Ela existe para o caso de a `anon key` ser usada de forma inesperada, que é
exatamente o cenário que ninguém prevê.

## Policies

### `plantao` — única leitura pública

```sql
CREATE POLICY plantao_leitura_anon ON plantao FOR SELECT TO anon
USING (
  ativo AND EXISTS (
    SELECT 1 FROM ciclo c WHERE c.id = plantao.ciclo_id AND c.status = 'PUBLICADO'
  )
);
```

Necessária para o Realtime funcionar no navegador. `plantao` não contém dado pessoal.
Nenhum `INSERT`/`UPDATE`/`DELETE` para `anon`.

### `rt`, `codigo_escala` — leitura de referência

```sql
CREATE POLICY rt_leitura_anon ON rt FOR SELECT TO anon USING (ativo);
CREATE POLICY codigo_leitura_anon ON codigo_escala FOR SELECT TO anon USING (ativo);
```

### Todas as demais — deny total para `anon`

`colaborador`, `marcacao`, `escala_dia`, `ciclo`, `participacao_ciclo`, `sessao_colaborador`,
`tentativa_login`, `troca_escala`, `audit_log`: **nenhuma policy para `anon`**. Ausência de
policy com RLS habilitada já nega.

### `app_server`

```sql
CREATE POLICY app_full ON <tabela> FOR ALL TO app_server USING (true) WITH CHECK (true);
```

Aplicada tabela a tabela, explicitamente. `FORCE RLS` faz valer inclusive para o dono.

## Funções

Toda função é `SECURITY INVOKER` por padrão. As que precisam de `SECURITY DEFINER`
(`marcar_extra`, `cancelar_extra`, `gerar_escala_mensal`) declaram `search_path` fixo e têm
execução revogada de `anon` e `authenticated`:

```sql
ALTER FUNCTION marcar_extra(uuid, uuid, origem_marcacao, text, text)
  SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION marcar_extra(uuid, uuid, origem_marcacao, text, text) TO app_server;
```

`search_path` fixo não é detalhe: sem ele, `SECURITY DEFINER` é vetor clássico de escalada.

## Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE plantao;
```

Só essa. Adicionar `marcacao` ou `escala_dia` à publication é violação direta de `SEC-CONF` —
o que o cliente precisa saber viaja por Broadcast com payload filtrado.

## Testes de aceitação (pgTAP)

| # | Teste | Esperado |
|---|---|---|
| R1 | Tabela sem RLS habilitada | zero |
| R2 | Tabela sem `FORCE RLS` | zero |
| R3 | `anon` lendo `marcacao`, `escala_dia`, `colaborador`, `audit_log` | negado |
| R4 | `anon` lendo `plantao` de ciclo RASCUNHO | zero linhas |
| R5 | `anon` lendo `plantao` de ciclo PUBLICADO | retorna |
| R6 | `anon` executando `marcar_extra` | negado |
| R7 | Função `SECURITY DEFINER` sem `search_path` fixo | zero |
| R8 | Publication contendo tabela além de `plantao` | zero |
