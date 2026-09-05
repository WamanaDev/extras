# Integridade

- **ID:** SEC-INT
- **Status:** PRONTA — **alteração exige revisão humana**
- **Pré-requisitos:** `02-seguranca/acid.md`

Confidencialidade protege contra leitura indevida. Integridade protege contra **escrita
indevida ou perda silenciosa de fidelidade** — inclusive por bug próprio, não só por ataque.

---

## Camadas

```
1. Zod na borda            → formato, tipo, faixa           → 422
2. Serviço                 → autorização e contexto         → 403 / 404
3. Função PL/pgSQL         → regra de negócio               → 409
4. Constraint              → invariante estrutural          → 500 (nunca deve chegar aqui)
```

Chegar na camada 4 significa que 1–3 falharam. Toda violação de constraint em produção é
incidente, não erro esperado — é alertada, não só logada.

## Validação de entrada

- Zod em **toda** borda: body, query, params, cookie, header customizado.
- `.strict()` sempre: propriedade não declarada é erro, não é ignorada.
- Coerção explícita. Nada de `Number(req.query.x)` solto.
- IDs são `uuid` validados. Nunca interpolação de string em SQL — `$queryRaw` com parâmetros
  tipados, sempre.
- Datas validadas e normalizadas para `America/Sao_Paulo` na borda, uma única vez.

## Nunca confiar no cliente

A UI antecipa bloqueios para dar feedback imediato (`FN-007` devolve `motivo`), mas a decisão
é **sempre** refeita no servidor no momento da gravação. Um cliente adulterado que envie
`plantaoId` de outra RT com cruzada desligada recebe `CRUZADA_BLOQUEADA` do banco.

Corolário: nenhuma rota aceita `colaboradorId` vindo do cliente para operação do próprio
colaborador. O ator vem **da sessão**, sempre.

## Autorização

Modelo simples e explícito, sem herança:

| Recurso | Colaborador | Admin |
|---|---|---|
| Própria escala | ler | ler, escrever |
| Escala de terceiros | — | ler, escrever |
| Próprias marcações | ler, criar, cancelar (na janela) | ler, criar, cancelar |
| Marcações de terceiros | — | tudo |
| Ciclo, plantão, limites | ler (publicado) | tudo |
| `audit_log`, `tentativa_login` | — | ler |

Todo handler chama `requireAtor('ADMIN' | 'COLABORADOR')` na primeira linha. Ausência dessa
chamada é erro de lint (regra customizada `require-ator`).

## `audit_log` append-only

```sql
REVOKE UPDATE, DELETE ON audit_log FROM app_server;
```

Encadeamento de hash para detectar adulteração por quem tenha acesso ao banco:

```sql
ALTER TABLE audit_log ADD COLUMN hash_anterior text, ADD COLUMN hash text;
-- hash = sha256(hash_anterior || id || ator_id || acao || entidade_id || payload::text || criado_em)
```

Job diário revalida a cadeia. Quebra = alerta crítico. Isso não impede adulteração por um
superusuário, mas torna a adulteração **detectável** — que é o objetivo realista.

## Integridade temporal

- `inicio_em` e `fim_em` são preenchidos por **trigger**, nunca pela aplicação. Duas fontes
  de verdade para o mesmo cálculo divergem, e divergência aqui quebra a regra de jornada.
- Intervalo semiaberto `[)` em toda comparação. Fechado faria turnos adjacentes colidirem.
- `TZ` fixo no banco e no runtime. Nenhum cálculo de escala usa `new Date()` sem timezone
  explícito.

## Espelho TS ↔ SQL

`validaDescanso` existe em TypeScript (UI) e em PL/pgSQL (decisão). Divergir é bug de
severidade alta. `07-testes/paridade-escala.md` define o teste de equivalência com 1000
cenários gerados comparando os dois vereditos. Roda em CI, bloqueia merge.

## CSRF

`SameSite=Lax` cobre o caso comum. Além disso, toda mutação exige header
`X-Requested-With: fetch` — ausente em submissão de formulário cross-site. Rotas de mutação
rejeitam `Content-Type: application/x-www-form-urlencoded`.

## Migrations

- Versionadas em `prisma/migrations/`, revisadas por humano.
- `prisma db push` **proibido** em qualquer ambiente compartilhado.
- Toda migration precisa aplicar e reverter limpo em base vazia (teste em CI).
- Migration destrutiva (`DROP COLUMN`, `DROP TABLE`) exige aprovação explícita e backup
  imediatamente anterior registrado.
- Adição de `NOT NULL` em tabela populada faz-se em três passos: coluna nullable → backfill →
  constraint.

## Reconciliação

| Job | Frequência | Ação em divergência |
|---|---|---|
| `vagas_ocupadas` vs contagem real | 10 min | alerta (**não** corrige sozinho) |
| Cadeia de hash do `audit_log` | diário | alerta crítico |
| `escala_dia` vs âncora do colaborador | diário | alerta com lista de divergências |
| Marcações confirmadas violando jornada | diário | alerta com lista |

O último é o mais valioso: ele detecta se alguma regra vazou. Se aparecer resultado, houve
bug ou caminho não coberto — investigar, não corrigir em massa.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| I1 | Payload com campo extra | `422`, não ignorado |
| I2 | `colaboradorId` de terceiro em rota de colaborador | ignorado; ator vem da sessão |
| I3 | `UPDATE` em `audit_log` como `app_server` | negado |
| I4 | Adulteração de linha do `audit_log` | job detecta quebra da cadeia |
| I5 | Aplicação escrevendo `inicio_em` divergente | trigger sobrescreve |
| I6 | 1000 cenários TS vs SQL | veredito idêntico |
| I7 | Toda migration up + down em base vazia | limpo |
| I8 | Handler sem `requireAtor` | lint falha |
| I9 | Query de jornada violada após suíte de carga | zero linhas |
