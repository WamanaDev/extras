# Conflitos e dependências não resolvidas

Registrado por sub-agente conforme `specs/AGENTS.md`, item 2. Não decidido
unilateralmente — aguarda revisão humana.

## 1. RESOLVIDO (Agente D, Onda 1) — "seed de `codigo_escala`" depende de tabela que ainda não existia (03-banco não implementado)

> Item original resolvido nesta rodada (DB-001/DB-005). Mantido abaixo como
> registro histórico, com a resolução ao final, em vez de removido, porque
> outras seções deste arquivo referenciam o raciocínio original.

- **IDs envolvidos:** `DOM-003` (`specs/01-dominio/codigos-escala.md`), `03-banco/modelo-dados.md`, `03-banco/migrations.md`.
- **Entregável do cabeçalho de DOM-003:** "seed de `codigo_escala`, `src/lib/escala/codigos.ts`".
- **Situação encontrada:** `prisma/schema.prisma` é hoje um stub sem nenhum model
  (comentário no próprio arquivo confirma: "O schema real ... é entregável de
  `03-banco/*` (Onda 1) e não deve ser antecipado aqui"). `prisma/migrations/`
  só contém migrations de `02-seguranca` (ACID, audit log, RLS, confidencialidade);
  não há migration que crie a tabela `codigo_escala`. `03-banco/` não tem
  `schema.prisma.md` nem migration de schema base.
- **Por que é um conflito, não só uma tarefa pendente:** DOM-003 não lista
  `03-banco/*` como pré-requisito no cabeçalho (não tem seção
  "Pré-requisitos"), mas seu entregável de seed SQL só pode existir depois que
  a tabela existir. Escrever a migration de seed agora, sem a tabela, violaria
  a Definição de Pronto ("migration aplica e reverte limpo em base vazia") e
  o limite rígido de não inventar schema fora do escopo de `03-banco` (Onda 1).
- **O que foi feito:** implementado `src/lib/escala/codigos.ts` (TS puro, sem
  dependência de banco) com a tabela de referência D/F/FT/FE, as flags
  `presenca`/`ocupaHorario`/`remunerada` e as regras DOM-003.1..6, incluindo a
  constante exportada `CODIGOS_BASE` — pensada para ser a fonte dos valores que
  a futura migration de seed deve inserir, na mesma ordem de flags. O seed SQL
  em si (`INSERT INTO codigo_escala ...`) não foi criado.
- **Pendência para quem implementar `03-banco` (Onda 1):** ao criar a migration
  que cria `codigo_escala`, incluir o seed dos 4 códigos-base usando os valores
  de `CODIGOS_BASE` (`src/lib/escala/codigos.ts`) como referência, e então
  remover este item deste arquivo.
- **RESOLUÇÃO (Agente D, Onda 1, DB-001/DB-005):** `prisma/schema.prisma`
  preenchido com todos os models de `modelo-dados.md`. `prisma/migrations/`
  reorganizado na ordem canônica MG (`001_extensoes` .. `010_seed_referencia`),
  preservando o SQL que a Onda 0 (segurança) já tinha escrito. O seed de
  `codigo_escala` agora existe em
  `prisma/migrations/20260101000010_seed_referencia/migration.sql` e em
  `prisma/seed.ts`, usando `CODIGOS_BASE` como fonte dos valores, na mesma
  ordem de flags. Pendência encerrada.
- **Nota adicional encontrada nesta rodada (não é conflito novo):**
  `03-banco/modelo-dados.md` termina com "O schema Prisma completo está em
  `03-banco/schema.prisma.md`" — esse arquivo não existe em `specs/03-banco/`.
  O cabeçalho da própria spec já diz corretamente que o entregável é
  `prisma/schema.prisma` (o que foi seguido). Registrado só para quem tiver
  escopo sobre `03-banco/modelo-dados.md` decidir se cria esse markdown
  espelho ou remove a frase.

## 2. Nota (Agente F, Onda 1) — `tocar_atualizado_em` em `plantao`: comentário em `schema.prisma` pede confirmação que a spec não dá

- **IDs envolvidos:** `DB-003` (`specs/03-banco/triggers.md`), comentário em
  `prisma/schema.prisma` (linhas ~295-297, tabela `Plantao.atualizadoEm`).
- **Situação encontrada:** `triggers.md`, seção `atualizado_em`, diz
  literalmente "Aplicado a `colaborador`, `ciclo`, `escala_dia`." — três
  tabelas, `plantao` não está na lista. O comentário deixado em
  `schema.prisma` pelo agente anterior (DB-001/DB-005), porém, pede para
  "confirmar aplicação em `plantao` quando Agente F escrever o trigger
  real", sugerindo que pode ter sido omissão da spec.
- **Por que registrar em vez de decidir sozinho:** a tarefa deste agente é
  seguir `triggers.md` ao pé da letra, sem adicionar nem relaxar. Adicionar
  o trigger em `plantao` seria inventar escopo que o texto da spec não
  contém; mas o comentário em `schema.prisma` é um sinal explícito de que
  outro agente considerou isso um ponto em aberto, não resolvido.
- **O que foi feito nesta rodada:** `prisma/migrations/20260101000005_triggers/migration.sql`
  aplica `tocar_atualizado_em` **apenas** a `colaborador`, `ciclo`,
  `escala_dia` — leitura literal de `triggers.md`. `plantao.atualizado_em`
  continua recebendo só o default de schema (`now()` na criação, sem toque
  automático em `UPDATE`). Nenhuma alteração feita em `prisma/schema.prisma`.
- **Pendência:** revisão humana decide se `triggers.md` deve ser atualizado
  para incluir `plantao` (e, se sim, uma migration adicional cria
  `trg_plantao_atualizado_em`) ou se o comentário em `schema.prisma` deve
  ser removido por estar desatualizado.

## 3. Nota (não é conflito) — lint `@typescript-eslint/no-explicit-any` sem plugin instalado

- `.eslintrc.json` (raiz) declara a regra `@typescript-eslint/no-explicit-any`,
  mas `@typescript-eslint/eslint-plugin`/`@typescript-eslint/parser` não estão
  em `package.json`. `pnpm lint` (via `npx eslint`) falha com
  "Definition for rule ... was not found" em **todo** arquivo `.ts`/`.tsx` do
  projeto, incluindo arquivos já existentes antes desta sessão (`ancora.ts`,
  `blocos.ts`). `pnpm typecheck` e `pnpm test` (Vitest) estão limpos.
- Não alterado aqui porque `package.json`/`.eslintrc.json` foram sinalizados
  como já entregues por outro agente ("não recrie"). Registrado para quem tiver
  escopo sobre tooling/config resolver (adicionar as duas dependências ao
  `package.json`).

## 4. Nota (Agente G3, Onda 1) — corpo de `FN-003 blocos_ocupados` na spec junta por coluna que não existe no schema

- **IDs envolvidos:** `FN-003` (`specs/03-banco/funcoes/fn-003-blocos-ocupados.md`),
  `03-banco/modelo-dados.md` / `prisma/schema.prisma` (model `EscalaDia`).
- **Situação encontrada:** a seção "Implementação" de `fn-003-blocos-ocupados.md`
  publica `JOIN codigo_escala ce ON ce.codigo = e.codigo` — ou seja, pressupõe
  que `escala_dia` tem uma coluna `codigo` (texto) igual à coluna `codigo` de
  `codigo_escala`. O schema real (já implementado por outro agente em
  `03-banco`, migrations `003_tabelas`/`004_constraints`/`005_triggers`/
  `006_indices`, todas completas antes desta tarefa) modela isso como FK:
  `escala_dia.codigo_escala_id uuid` → `codigo_escala.id`. Não existe coluna
  `codigo` em `escala_dia`; `JOIN ... ON ce.codigo = e.codigo` falharia em
  tempo de criação da função (coluna inexistente).
- **Por que é conflito, não erro de digitação óbvio:** a spec `FN-003` foi
  escrita (aparentemente) contra um esboço anterior de schema (ver também
  `specs/_arquivo/documento-base.md`, que tem o mesmo texto), antes do modelo
  de dados final normalizar `codigo_escala` como tabela referenciada por FK
  em vez de string repetida. É uma contradição entre duas specs já marcadas
  `PRONTA` (`FN-003` e o modelo de dados/schema de `03-banco`), não algo que
  este agente deveria decidir sozinho a resolução "certa" per AGENTS.md item 2.
- **O que foi feito:** para não bloquear a entrega (a função precisa existir
  e compilar contra o schema real para a cadeia de migrations aplicar de
  ponta a ponta em base vazia — Definição de Pronto / MG-3), o `JOIN` foi
  ajustado para `ce.id = e.codigo_escala_id`, preservando literalmente todo
  o resto do corpo publicado na spec: mesmo filtro `(ce.presenca OR
  ce.ocupa_horario)` (o "ponto sutil" da spec, testado em F3-3/F3-4), mesma
  união com `marcacao`, mesmo `ORDER BY 1`. Nenhuma regra de negócio foi
  alterada — só a forma de achar a linha de `codigo_escala` a partir de
  `escala_dia`, que é imposta pelo schema já fixado por outro agente, fora do
  escopo desta tarefa. Ver
  `prisma/migrations/20260101000007_funcoes/migration.sql`.
- **Pendência:** revisão humana decide se `fn-003-blocos-ocupados.md` deve
  ser atualizada para publicar `ce.id = e.codigo_escala_id` (mantendo o texto
  em sincronia com o schema real), já que o corpo aqui implementado diverge
  do "Entregável" literal do cabeçalho da spec nesse único ponto.

## 5. Nota (Agente G5, Onda 1) — corpo de `FN-005 marcar_extra` lê `escala_dia.codigo`, coluna que não existe (mesma divergência já registrada no item 4, FN-003)

- **IDs envolvidos:** `FN-005` (`specs/03-banco/funcoes/fn-005-marcar-extra.md`,
  passo 7 "ausência no dia" da ordem de execução), `03-banco/modelo-dados.md` /
  `prisma/schema.prisma` (model `EscalaDia`).
- **Situação encontrada:** a seção "Implementação" de `fn-005-marcar-extra.md`
  publica `SELECT * INTO v_escala FROM escala_dia WHERE ... ; IF FOUND AND
  v_escala.codigo <> 'D' ...`, pressupondo (como a spec de FN-003, item 4
  acima) que `escala_dia` tem coluna `codigo` (texto). O schema real só tem
  `escala_dia.codigo_escala_id uuid` → FK para `codigo_escala.id`; o texto
  `'D'`/`'F'`/... vive em `codigo_escala.codigo`. `v_escala.codigo` falharia
  em tempo de criação da função (`CREATE FUNCTION` valida corpo do plpgsql).
- **Por que é conflito, não erro de digitação óbvio:** mesma causa raiz do
  item 4 — `FN-005` e `FN-003` parecem ter sido escritas contra o mesmo
  esboço de schema anterior à normalização de `codigo_escala` como tabela
  referenciada por FK. Duas specs `PRONTA` (`FN-005` e o schema real de
  `03-banco`) se contradizem; não é decisão que este agente deva tomar
  sozinho (AGENTS.md item 2), mas o limite rígido de FN-005 (revisão humana
  para alterar a *lógica*) não cobre um ajuste de acesso a coluna que não
  existe — sem ele a migration simplesmente não aplica (MG-3).
- **O que foi feito:** para não bloquear a cadeia de migrations em base
  vazia, o passo 7 foi reescrito como `SELECT ce.codigo INTO v_escala_codigo
  FROM escala_dia e JOIN codigo_escala ce ON ce.id = e.codigo_escala_id
  WHERE ...`, preservando literalmente a regra (`FOUND AND codigo <> 'D' AND
  NOT permite_extra_em_folga → EM_AUSENCIA`) e a ordem de execução da spec.
  Nenhuma regra de negócio alterada — só a forma de obter o texto do código.
  Ver `prisma/migrations/20260101000007_funcoes/migration.sql`.
- **Pendência:** revisão humana decide se `fn-005-marcar-extra.md` deve ser
  atualizada para publicar o JOIN (mantendo-a em sincronia com o schema
  real), junto com a mesma decisão pendente para `fn-003-blocos-ocupados.md`
  (item 4).

## 6. Nota (Agente G5, Onda 1) — corpo de `FN-005 marcar_extra` grava `ip`/`user_agent` em `marcacao`, colunas que não existem nessa tabela

- **IDs envolvidos:** `FN-005` (`specs/03-banco/funcoes/fn-005-marcar-extra.md`,
  passo 11 "INSERT + UPDATE contador"), `03-banco/modelo-dados.md` /
  `prisma/schema.prisma` (model `Marcacao`), `02-seguranca/acid.md` (seção
  "D — Durabilidade" da própria FN-005: "`audit_log` gravado pelo chamador
  **na mesma transação** (AUD-2)").
- **Situação encontrada:** a assinatura de `marcar_extra` recebe `p_ip
  text` e `p_user_agent text` (exigidos por 008_rls, que já declara
  `marcar_extra(uuid, uuid, origem_marcacao, text, text)` — não é opcional
  remover os parâmetros). O corpo publicado na spec faz `INSERT INTO
  marcacao (id, plantao_id, colaborador_id, status, cruzada, origem, ip,
  user_agent) VALUES (...)`. A tabela `marcacao`
  (`prisma/migrations/20260101000003_tabelas/migration.sql`, confirmado
  também em `prisma/schema.prisma`, model `Marcacao`) **não tem** colunas
  `ip`/`user_agent` — só `sessao_colaborador`, `tentativa_login` e
  `audit_log` têm essas colunas no schema inteiro. `CREATE FUNCTION`
  falharia em tempo de criação (coluna inexistente).
- **Por que é conflito, não erro de digitação óbvio:** a própria spec FN-005,
  na seção ACID/"D", já diz que quem grava `audit_log` (tabela que *tem*
  `ip`/`user_agent`) **na mesma transação** é o chamador, não a função — ou
  seja, os parâmetros parecem existir precisamente para esse repasse ao
  `audit_log` do chamador, não para uma coluna em `marcacao` que nunca foi
  modelada. Ainda assim, o corpo "Implementação" da spec, publicado como SQL
  literal, contradiz sua própria seção "ACID" e o schema já fixado por outro
  agente — não é algo que este agente deva resolver sozinho quanto à
  intenção original, só quanto ao mínimo para a migration aplicar.
- **O que foi feito:** o `INSERT` foi ajustado para omitir `ip`/`user_agent`
  (`INSERT INTO marcacao (id, plantao_id, colaborador_id, status, cruzada,
  origem) VALUES (...)`), sem tocar nas demais colunas nem na ordem de
  execução. Os parâmetros `p_ip`/`p_user_agent` permanecem na assinatura da
  função (contrato com 008_rls preservado) e ficam disponíveis, sem uso
  dentro de `marcar_extra`, para o `INSERT INTO audit_log` que o chamador
  faz na mesma transação (AUD-2) — leitura consistente com a seção "D" da
  própria spec. Nenhuma regra de negócio alterada. Ver
  `prisma/migrations/20260101000007_funcoes/migration.sql`.
- **Pendência:** revisão humana decide (a) se `fn-005-marcar-extra.md` deve
  ser atualizada para remover `ip`/`user_agent` do `INSERT` publicado
  (mantendo-o em sincronia com o schema real e com a própria seção "D" da
  spec), e (b) se vale a pena adicionar colunas `ip`/`user_agent` a
  `marcacao` em vez disso — decisão de modelo de dados fora do escopo deste
  agente.

## 7. Nota (Agente G2, Onda 1) — `FN-002 gerar_escala_mensal`: três divergências entre a spec, o schema real e 008_rls

- **IDs envolvidos:** `FN-002` (`specs/03-banco/funcoes/fn-002-gerar-escala-mensal.md`),
  `03-banco/modelo-dados.md` / `prisma/schema.prisma` (models `EscalaDia`,
  `Colaborador`), `02-seguranca/rls-policies.md` /
  `prisma/migrations/20260101000008_rls/migration.sql` (limite rígido),
  `04-api/admin-ciclos/API-ADM-CIC-003-gerar-escala.md`.

**(a) Assinatura — `gerar_escala_mensal(uuid)` vs `gerar_escala_mensal(uuid, int, int)`.**
A seção "Assinatura" de `fn-002-gerar-escala-mensal.md` publica
`gerar_escala_mensal(p_ciclo_id uuid) RETURNS int`, um único parâmetro — e
`API-ADM-CIC-003-gerar-escala.md` chama `gerar_escala_mensal(id)`, também um
argumento, consistente com a spec. Só que `008_rls` (já aplicado por outro
agente na Onda 0/segurança, limite rígido) faz `ALTER FUNCTION
gerar_escala_mensal(uuid, int, int) SECURITY DEFINER ...` e `GRANT EXECUTE ON
FUNCTION gerar_escala_mensal(uuid, int, int) TO app_server` — três
parâmetros. O próprio header deste arquivo de migration (topo, escrito por
outro agente antes desta rodada) já avisa que a assinatura precisa bater
"exata" com 008_rls. Duas specs `PRONTA` (`FN-002`/`API-ADM-CIC-003`) e um
limite rígido já aplicado (`008_rls`) se contradizem quanto à aridade da
função — não é decisão que este agente deva tomar sozinho quanto à intenção
original (para que servem os dois `int` extras nunca foi documentado em
nenhuma spec lida). **Resolução aplicada (mínima, sem inventar
comportamento):** assinatura ajustada para `gerar_escala_mensal(p_ciclo_id
uuid, p_ano int DEFAULT NULL, p_mes int DEFAULT NULL)` — satisfaz o `ALTER
FUNCTION`/`GRANT` de 008_rls (que casa por tipo, independente de default) e
continua aceitando a chamada de 1 argumento de `API-ADM-CIC-003` (resolução
de overload do Postgres permite omitir parâmetros finais com `DEFAULT`). O
**corpo** ignora `p_ano`/`p_mes` e deriva ano/mês de `v_ciclo.ano`/`v_ciclo.mes`
exatamente como a spec publica — nenhuma lógica nova, só a assinatura.

**(b) `escala_dia` não tem coluna `turno` nem `codigo`.**
Mesma causa raiz dos itens 4/5 (specs escritas contra um esboço de schema
anterior à normalização final): a spec publica `INSERT INTO escala_dia (...,
turno, codigo, ...) SELECT ..., COALESCE(t.turno, c.turno_padrao), 'D', ...`.
O schema real (`prisma/schema.prisma`, model `EscalaDia`; migration
`20260101000003_tabelas`) não tem coluna `turno` (turno não é modelado por
dia de escala — só em `plantao.tipo`/`colaborador.turno_padrao`/
`troca_escala.turno`) nem `codigo` (é `codigo_escala_id`, FK para
`codigo_escala.id`, igual aos itens 4/5). **Resolução:** coluna `turno`
removida da lista do `INSERT` (nada no schema para gravá-la — nenhuma regra
RN-02..05 depende disso); `codigo` trocado por `codigo_escala_id`, resolvido
via `SELECT id INTO v_codigo_d_id FROM codigo_escala WHERE codigo = 'D' AND
ativo LIMIT 1` antes do laço principal. Ver
`prisma/migrations/20260101000007_funcoes/migration.sql`.

**(c) `escala_ancora`/`turno_padrao` são `NOT NULL` no schema real — teste F2-7 ("colaborador sem âncora") não é exercitável.**
A spec filtra `WHERE c.ativo AND c.escala_ancora IS NOT NULL AND
c.turno_padrao IS NOT NULL`, e o teste de aceitação F2-7 espera um
colaborador "sem âncora" pulado sem erro — o mesmo vocabulário aparece em
`API-ADM-CIC-003` (`motivo: 'SEM_ANCORA' | 'SEM_TURNO'` na resposta). Mas a
migration `20260101000003_tabelas` declara `turno_padrao turno NOT NULL` e
`escala_ancora date NOT NULL` — logo nenhum colaborador pode existir na base
sem essas colunas preenchidas; o cenário "sem âncora" descrito nos testes de
FN-002 e de API-ADM-CIC-003 é, no schema atual, impossível de reproduzir com
um `INSERT` real (violaria `NOT NULL`). **O que foi feito:** os predicados
`IS NOT NULL` foram mantidos ao pé da letra no corpo SQL (inofensivos —
sempre verdadeiros contra o schema atual, não impedem `CREATE FUNCTION` nem
mudam o resultado); o teste pgTAP F2-7
(`tests/pgtap/fn-002-gerar-escala-mensal.pgtap.sql`) foi marcado com
`skip()` em vez de fingir um cenário que a base não permite. **Pendência:**
revisão humana decide se `escala_ancora`/`turno_padrao` devem virar
nullable (permitindo o cenário real de "colaborador cadastrado sem âncora
ainda"), ou se a spec/teste F2-7 e o `motivo: 'SEM_ANCORA'` de
`API-ADM-CIC-003` devem ser removidos por não se aplicarem mais ao modelo de
dados atual — decisão de modelo de dados fora do escopo deste agente.

## 8. Nota (Agente G6, Onda 1) — `FN-006 cancelar_extra`: assinatura da spec (5 parâmetros) não bate com a assinatura já fixada em `008_rls` (3 parâmetros)

- **IDs envolvidos:** `FN-006` (`specs/03-banco/funcoes/fn-006-cancelar-extra.md`,
  seção "Assinatura"), `02-seguranca/rls-policies.md` /
  `prisma/migrations/20260101000008_rls/migration.sql` (limite rígido).
- **Situação encontrada:** a seção "Assinatura" de `fn-006-cancelar-extra.md`
  publica `cancelar_extra(p_marcacao_id uuid, p_ator_tipo text, p_ator_id
  uuid, p_ip text, p_user_agent text) RETURNS marcacao` — 5 parâmetros. Mas
  `008_rls` (já aplicado por outro agente na Onda 0/segurança, limite
  rígido) faz `ALTER FUNCTION cancelar_extra(uuid, uuid, text) SECURITY
  DEFINER ...` e `GRANT EXECUTE ON FUNCTION cancelar_extra(uuid, uuid,
  text) TO app_server` — só 3 parâmetros, tipos `(uuid, uuid, text)`, sem
  espaço para `p_ip`/`p_user_agent`. O próprio header deste arquivo de
  migration (topo, escrito por outro agente antes desta rodada) já avisa
  que a assinatura precisa bater "exata" com 008_rls, citando literalmente
  `cancelar_extra(uuid, uuid, text)`.
- **Por que é conflito, não erro de digitação óbvio:** mesma causa raiz do
  item 7(a) (`FN-002`/`gerar_escala_mensal`) — duas specs `PRONTA`
  (`FN-006` e `02-seguranca/rls-policies.md`, já materializada em 008_rls)
  se contradizem quanto à aridade da função; não é decisão que este agente
  deva tomar sozinho quanto à intenção original (AGENTS.md item 2), mas sem
  ajuste a migration simplesmente não aplica em base vazia (MG-3).
- **O que foi feito:** assinatura ajustada para `cancelar_extra(p_marcacao_id
  uuid, p_ator_id uuid, p_ator_tipo text)` — casa exatamente, por posição e
  tipo, com o `ALTER FUNCTION`/`GRANT` de 008_rls. `p_ip`/`p_user_agent`
  foram removidos da assinatura (não cabem nos 3 parâmetros que 008_rls já
  fixou): mesmo raciocínio já registrado no item 6 (`FN-005`) — esses dois
  parâmetros nunca seriam gravados dentro da função de qualquer forma
  (`marcacao` não tem colunas `ip`/`user_agent`); aqui o chamador que grava
  `audit_log` na mesma transação (ACID/AUD-2) já tem `ip`/`user_agent` à
  mão na própria requisição HTTP, sem precisar recebê-los de volta desta
  função. `p_ator_id`/`p_ator_tipo` (textos, não o enum `origem_marcacao` —
  008_rls exige `text` na terceira posição) são o mínimo necessário para
  aplicar a tabela de autorização da spec (colaborador só cancela a
  própria marcação; admin cancela qualquer uma de ciclo não `FECHADO`).
  Nenhuma regra de negócio alterada — só a forma de receber quem está
  cancelando. Ver `prisma/migrations/20260101000007_funcoes/migration.sql`.
- **Pendência:** revisão humana decide se `fn-006-cancelar-extra.md` deve
  ser atualizada para publicar `cancelar_extra(uuid, uuid, text)` (mantendo
  a spec em sincronia com 008_rls, já aplicado), com o mesmo tipo de
  decisão já pendente para o item 7(a) (`FN-002`).

## 9. Nota (Agente G7, Onda 1) — `FN-007 plantoes_para_colaborador`: assinatura publica tipo e coluna que não existem no schema (`tipo_plantao`, `rt.codigo`); mesmo problema alcança `FN-009 cobertura_ciclo`, ainda não implementada

- **IDs envolvidos:** `FN-007` (`specs/03-banco/funcoes/fn-007-plantoes-para-colaborador.md`,
  seção "Assinatura"), `FN-009` (`specs/03-banco/funcoes/fn-009-cobertura-ciclo.md`,
  mesma seção — não implementada nesta rodada, escopo de outro agente),
  `03-banco/modelo-dados.md` / `prisma/schema.prisma` (models `Plantao`, `Rt`).
- **Situação encontrada:** `fn-007-plantoes-para-colaborador.md` publica
  `RETURNS TABLE (plantao_id uuid, data date, tipo tipo_plantao, rt_codigo
  text, ...)`. Duas coisas não existem no schema real:
  (a) o enum `tipo_plantao` — o schema (migration `20260101000002_enums`,
      `prisma/schema.prisma`) só tem `enum Turno { DIURNO NOTURNO } @@map
      ("turno")`; `plantao.tipo` é `turno NOT NULL`, não `tipo_plantao`.
      `CREATE FUNCTION ... RETURNS TABLE (..., tipo tipo_plantao, ...)`
      falharia em tempo de criação (tipo inexistente).
  (b) a coluna `rt.codigo` — `rt` (migration `20260101000003_tabelas`,
      model `Rt`) só tem `id`, `nome`, `ativo`, `criado_em`; não tem
      `codigo`. Uma implementação literal de `rt_codigo` lendo `rt.codigo`
      falharia do mesmo jeito (coluna inexistente).
  `fn-009-cobertura-ciclo.md` (linha 11: `RETURNS TABLE (data date, rt_codigo
  text, turno tipo_plantao, ...)`) publica exatamente os mesmos dois nomes
  problemáticos — mesma causa raiz, function ainda não implementada nesta
  onda (fora do escopo deste agente, G7/FN-007).
- **Por que é conflito, não erro de digitação óbvio:** mesma causa raiz já
  registrada nos itens 4/5/7/8 — specs de função escritas contra um esboço
  de schema anterior à normalização final (`codigo_escala` como FK em vez
  de string, e aqui também `turno` como nome de enum e `rt` sem coluna de
  código curto). Duas specs `PRONTA` (`FN-007`/`FN-009`) divergem do modelo
  de dados já fixado por outro agente (`03-banco`, Onda 1); não é decisão
  que este agente deva tomar sozinho sobre a intenção original (AGENTS.md
  item 2), mas sem ajuste `CREATE FUNCTION` não aplica (MG-3).
- **O que foi feito (só em FN-007, escopo deste agente):** a assinatura foi
  ajustada para `tipo turno` (mesmo enum já usado em `plantao.tipo`) e
  `rt_codigo text` foi mantido como **nome de coluna de saída** (contrato
  que `04-api/colaborador/*`, consumidor futuro, deve esperar), mas
  alimentado por `rt.nome` — a única coluna de rótulo que `rt` de fato tem —
  em vez de uma coluna `rt.codigo` inexistente. Nenhuma lógica de
  disponibilidade/motivo alterada; só a origem de duas colunas de saída. Ver
  `prisma/migrations/20260101000007_funcoes/migration.sql`, função
  `plantoes_para_colaborador`.
- **Pendência:** revisão humana decide (a) se `fn-007-*.md`/`fn-009-*.md`
  devem ser atualizadas para publicar `tipo turno` e `rt_codigo` alimentado
  por `rt.nome` (mantendo as specs em sincronia com o schema real), e (b) se
  `rt` deveria ganhar uma coluna `codigo` curta separada de `nome` — decisão
  de modelo de dados fora do escopo deste agente. Quem implementar `FN-009`
  deve aplicar a mesma resolução aqui registrada, em vez de redescobrir o
  mesmo conflito.

## 10. Nota (Agente G9, Onda 1, fechamento da onda de banco de dados) — `FN-009 cobertura_ciclo`: reaproveitou a resolução do item 9 (turno/rt_codigo) e encontrou uma TERCEIRA divergência nova, sem equivalente no schema — `rt.cobertura_minima_diurno`/`_noturno` não existem em nenhuma migration aplicada

- **IDs envolvidos:** `FN-009` (`specs/03-banco/funcoes/fn-009-cobertura-ciclo.md`,
  linha 24: "`minimo` vem da configuração da RT
  (`rt.cobertura_minima_diurno` / `_noturno`)"), `03-banco/modelo-dados.md` /
  `prisma/schema.prisma` (model `Rt`).
- **Situação encontrada:** as duas primeiras divergências da assinatura de
  `FN-009` (`turno tipo_plantao` → `turno turno`, `rt_codigo` lido de
  `rt.codigo` → lido de `rt.nome`) são a MESMA causa raiz já registrada no
  item 9 (agente G7, `FN-007`) — reaproveitadas ao pé da letra aqui, sem
  redescobrir. A terceira, nova nesta rodada: `rt` (`prisma/schema.prisma`,
  migration `20260101000003_tabelas`) nunca teve, em nenhuma migration
  aplicada até `20260101000007_funcoes` (antes desta rodada), as colunas
  `cobertura_minima_diurno`/`cobertura_minima_noturno` que a spec nomeia
  explicitamente como fonte do campo `minimo`. Diferente dos itens 4/5/7/8/9
  (nome de coluna/tipo errado, com um equivalente correto já existente no
  schema para substituir), aqui não havia NENHUMA fonte de "mínimo de
  cobertura por RT/turno" em lugar nenhum do schema — nem sob outro nome.
- **Por que é conflito, não simples ajuste de nome:** sem uma coluna de
  configuração, `cobertura_ciclo` não tem como calcular `deficit`
  (obrigatório pelos próprios testes de aceitação da spec, F9-1..F9-5, que
  exigem `deficit` sensível a um mínimo configurado) — a spec `PRONTA` é
  irrealizável no schema como estava. Isso é uma peça de modelo de dados
  ausente, não um erro de nome; decisão de schema normalmente não é deste
  agente (AGENTS.md item 2), mas sem ela nem `CREATE FUNCTION` nem os testes
  de aceitação da própria spec (exigidos por "Definição de pronto") são
  possíveis (MG-3, mesma urgência dos itens 7/8 desta lista).
- **O que foi feito:** `ALTER TABLE rt ADD COLUMN cobertura_minima_diurno
  int NOT NULL DEFAULT 0, ADD COLUMN cobertura_minima_noturno int NOT NULL
  DEFAULT 0;` adicionado em `20260101000007_funcoes/migration.sql`,
  imediatamente antes de `CREATE OR REPLACE FUNCTION cobertura_ciclo`
  (mesmo arquivo — nenhuma migration anterior foi alterada). `DEFAULT 0`:
  neutro, não quebra nenhuma linha de `rt` já semeada por outra
  migration/fixture (sem configuração explícita, nenhum déficit é reportado
  até o admin definir um mínimo real — mesma convenção de "ausência de
  config = sem restrição adicional" já usada em `ciclo.permite_cruzada`/
  `permite_extra_em_folga`). `prisma/schema.prisma` (model `Rt`) atualizado
  no mesmo commit com os dois campos novos (`coberturaMinimaDiurno`/
  `coberturaMinimaNoturno`, `@default(0)`), para o ORM refletir a coluna
  real. Nenhuma lógica de negócio inventada: os nomes de coluna usados são
  exatamente os que a spec `PRONTA` já nomeava.
- **Pendência:** revisão humana decide (a) se este é o valor certo para
  todas as RTs existentes hoje, ou se deveria haver um valor de seed
  diferente por RT (fora do escopo deste agente — nenhuma spec de seed
  nomeia esses números), e (b) se `fn-009-cobertura-ciclo.md` deveria ganhar
  uma nota apontando que a coluna foi criada por esta migration em vez de
  ter sido assumida como pré-existente. Ver
  `prisma/migrations/20260101000007_funcoes/migration.sql`, função
  `cobertura_ciclo` e o `ALTER TABLE rt` que a precede.

## 11. Nota (Agente H, Onda 2, API-000) — `contrato-comum.md` implementado; dois pontos que as 54 specs de `04-api/*` (Onda 2, rodada seguinte) devem conhecer ao herdar deste contrato

- **IDs envolvidos:** `API-000` (`specs/04-api/contrato-comum.md`), entregáveis
  `src/server/http/handler.ts` (`defineHandler`) e `src/server/http/erros.ts`.
  Não é um conflito entre duas specs `PRONTA` como os itens 1–10 (nenhuma
  spec de rota concreta existia ainda para contradizer) — é a documentação
  de duas decisões de design tomadas por não haver contrato explícito, para
  que os 8 agentes que implementam `04-api/*` em paralelo logo em seguida
  não redescubram o mesmo ponto em isolamento nem divirjam entre si.

**(a) `rateLimit` em `defineHandler`: a config aceita só `{ escopo,
identificador? }`, não `{ escopo, limite, janela }` como o exemplo literal de
`contrato-comum.md`.** O cabeçalho da spec mostra `rateLimit: { escopo:
'sessao', limite: 10, janela: '1m' }` — mas `02-seguranca/disponibilidade.md`
(já implementada, `src/server/http/rate-limit.ts`) fixa uma tabela **central**
de limite/janela por escopo nomeado (`marcacoes_por_sessao`,
`leitura_por_sessao`, `login_matricula`, etc.), sem parâmetro de override por
rota — e o próprio limite rígido do projeto proíbe alterar `02-seguranca/*`
sem revisão humana. Aceitar `limite`/`janela` por rota duplicaria/contradiria
essa tabela central. **Resolução:** `ConfigHandler['rateLimit']` reaproveita
o tipo `EscopoRateLimit` já existente (reuso, não duplicação — AGENTS.md) e
ignora `limite`/`janela` da forma do exemplo. Cada rota escolhe o escopo já
tabelado que se aplica; se uma spec de `04-api/*` precisar de um limite que
não existe em nenhum escopo já nomeado, isso é uma lacuna de
`disponibilidade.md`, não algo que `defineHandler` deva inventar.

**(b) Autenticação padrão (`resolverSessaoPadrao` em `handler.ts`) assume um
nome de cookie (`sessao_colaborador`) que nenhuma spec ainda fixou.**
`contrato-comum.md` diz "Ator vem sempre da sessão" mas não nomeia o cookie;
`04-api/auth/API-AUTH-001..006` (login, PIN, admin-login, logout) são quem
efetivamente cria a sessão e portanto quem decide o nome real do cookie. Para
que o pipeline (`requestId → rate limit → autenticação → ...`) tivesse uma
implementação padrão funcional — e não só uma interface vazia — foi
assumido `sessao_colaborador` (nome espelhando a tabela
`sessao_colaborador`) para o cookie do colaborador, lido e comparado via
`hashDoToken` (`src/server/auth/credenciais.ts`, já existente — reaproveitado,
não duplicado) contra `sessao_colaborador.token_hash`; sessão de admin é
resolvida via `@supabase/ssr` (`stack.md`, "Auth admin: Supabase Auth + MFA"),
sem nome de cookie assumido (a biblioteca gerencia isso). **Isso não bloqueia
nenhuma rota**: `criarDefineHandler(dependencias)` aceita um `resolverSessao`
injetado, e a rota (ou o próprio `route.ts` real) pode passar seu próprio
resolvedor se `API-AUTH-*` definir um nome de cookie diferente — só a
exportação `defineHandler` (a fábrica com dependências padrão) ficaria
desatualizada nesse nome, num único ponto (`resolverSessaoColaborador` em
`handler.ts`), fácil de ajustar. **Pendência:** quem implementar
`API-AUTH-001-login.md` (que efetivamente grava o cookie) deve confirmar ou
corrigir o nome `sessao_colaborador` neste arquivo; se corrigir, é uma troca
de uma string em um único lugar, sem redesenhar o pipeline.

**(c) `.eslintrc.json` ganhou um `override` para `src/app/api/**/route.ts`**
exigindo que todo `export const GET/POST/...` seja uma chamada direta a
`defineHandler` (regra `no-restricted-syntax`, ESLint core — não depende do
plugin `@typescript-eslint` ausente, item 3 desta lista; testado manualmente
contra um handler de exemplo sem `defineHandler`, que a regra recusa, e um
com `defineHandler`, que passa). Isso cumpre literalmente "Handler sem
`defineHandler` é erro de lint" de `contrato-comum.md`. Não resolve o gap do
item 3 (regra `@typescript-eslint/no-explicit-any` continua sem o plugin
instalado) — só não piora, como pedido: a regra nova roda mesmo com o gap
presente, verificado nesta rodada.

## 12. Nota (Agente auth, Onda 2, `04-api/auth/API-AUTH-001..006`) — cinco pontos resolvidos ao implementar login/PIN/logout/me/admin-login

- **IDs envolvidos:** `API-AUTH-001` a `API-AUTH-006`
  (`specs/04-api/auth/*.md`), `API-000` (`src/server/http/erros.ts`,
  `src/server/http/handler.ts`), item 11(b) e item 9 desta lista.

**(a) Nome do cookie de sessão do colaborador — confirma item 11(b).**
`API-AUTH-002-pin.md` nomeia o cookie só como `sessao`; `handler.ts`
(`resolverSessaoColaborador`) já assumia `sessao_colaborador`, pedindo
confirmação de quem implementasse `API-AUTH-001`/`002`. Mantido
`sessao_colaborador` (espelha o nome da tabela, já é o que `handler.ts`
lê) — trocar exigiria editar o resolvedor padrão compartilhado por toda
`04-api/*` já em uso pelas outras 8 rodadas paralelas, por um ganho puramente
cosmético. `src/app/api/auth/colaborador/{login,pin,definir-pin,logout}/route.ts`
usam esse nome consistentemente.

**(b) `rt.codigo` não existe no schema (mesma causa raiz do item 9).**
`API-AUTH-002-pin.md`/`API-AUTH-005-me.md` pedem `colaborador.rt: { codigo,
nome }`, mas `model Rt` só tem `nome` (sem `codigo`), exatamente o problema já
registrado no item 9. Aplicada a mesma resolução ali fixada: o campo de saída
`codigo` é alimentado por `rt.nome` (única coluna de rótulo existente), em vez
de inventar uma coluna nova. Ver `src/app/api/auth/colaborador/pin/route.ts` e
`src/app/api/auth/me/route.ts`.

**(c) `erros.ts`: `CodigoErroNegocio` estendido de forma aditiva** com
`CREDENCIAIS_INVALIDAS`, `CONTA_BLOQUEADA`, `COLABORADOR_INATIVO`,
`TOKEN_INVALIDO`, `PIN_NAO_DEFINIDO`, `PIN_FRACO`, `PIN_NAO_CONFERE`,
`PIN_JA_DEFINIDO`, `MFA_OBRIGATORIO` — mesmo padrão aditivo que outro agente
paralelo já usou no mesmo arquivo para `API-ADM-COL-*`/`API-ADM-PAR-*` (ver o
comentário já presente acima de `CodigoErroNegocio`). Nenhum código existente
foi removido/redefinido; só `erroDeNegocio`/`traduzirErro` continuam
inalterados.

**(d) `MUITAS_TENTATIVAS` (nome usado nas tabelas de erro das specs
`API-AUTH-001`/`002`/`006` para status `429`) diverge do código já fixo do
pipeline comum, `LIMITE_EXCEDIDO`** (`erroLimiteExcedido`, `API-000`, usado
por `defineHandler` no passo de rate limit e já em produção nas outras
rodadas paralelas). Resolução: as rotas de `auth/*` continuam usando
`erroLimiteExcedido`/código `LIMITE_EXCEDIDO` para toda resposta `429`
(tanto a do rate limit declarativo do `defineHandler` quanto a checagem
manual por matrícula dentro do handler) — divergir do código já padronizado
por rota quebraria a consistência entre as 54 specs de `04-api/*` por um
ganho só de nome. **Pendência:** revisão humana decide se as tabelas de erro
de `API-AUTH-001`/`002`/`006` devem ser atualizadas de `MUITAS_TENTATIVAS`
para `LIMITE_EXCEDIDO`.

**(e) Sessão do admin "expira em 4h" (`API-AUTH-006`, "CIA", "I") não é algo
que `POST /api/auth/admin/login` controle diretamente** — a duração da sessão
do Supabase Auth é configuração de projeto (JWT expiry), não parâmetro de
`supabase.auth.signInWithPassword`/MFA. A rota audita e devolve o resultado
do desafio MFA/login normalmente; a duração real da sessão depende da
configuração do projeto Supabase (fora do código desta rota). **Pendência:**
confirmar em `00-fundacao/ambiente.md`/painel do Supabase que o projeto está
configurado para expirar sessão em 4h; não há teste de unidade possível para
isso sem mockar o SDK inteiro (o teste de aceitação #4 de `API-AUTH-006`
cobre a leitura de `expires_in` devolvida pelo mock do SDK, não a
configuração real do projeto).

## 14. Nota (retomada `04-api/admin-relatorios/API-ADM-REL-001..004`) — quatro pontos resolvidos ao terminar as rotas de relatório sobre o que a Onda 2 anterior já tinha deixado em `src/server/relatorios/{ciclo,csv,xlsx,zip,exportacao-ciclo,prisma-cliente}.ts`

- **IDs envolvidos:** `API-ADM-REL-001` a `API-ADM-REL-004`
  (`specs/04-api/admin-relatorios/*.md`), `API-000` (`src/server/http/handler.ts`),
  `SEC-AUD`/`SEC-CONF`, itens 11(c), 12 e 13 desta lista.

**(a) Resposta binária de `API-ADM-REL-002` e corpo `{ eventos }` +
`X-Total-Count` de `API-ADM-REL-003` usam a passagem direta de `NextResponse`
já presente em `handler.ts`** (`resultado instanceof NextResponse`, ver o
doc-comment desse arquivo, que já citava as duas rotas nominalmente como
motivo de a passagem existir). Isso significa que estas duas rotas **não**
usam o workaround mais antigo (base64 no corpo JSON + uma segunda função
`GET` que reempacota) de
`src/app/api/admin/ciclos/[id]/escala/export/route.ts` e
`src/app/api/admin/colaboradores/[id]/exportar-dados/route.ts` — esse
workaround foi escrito antes do pipeline ganhar a passagem direta. Os dois
padrões coexistem no repositório por essa razão histórica (nenhum dos dois
está "errado"; o mais novo é só mais simples). Nenhuma alteração em
`handler.ts` foi necessária — o suporte já existia, só não tinha sido usado
ainda por nenhuma rota concreta.

**(b) `atorNome` de `API-ADM-REL-003` fica `null` quando `atorTipo === 'ADMIN'`.**
O contrato pede `{ ..., atorId, atorNome, ... }` por evento, mas não existe
tabela local de admin — autenticação de admin é via Supabase Auth
(`stack.md`, "Auth admin"), e `AuditLog.atorId` para um evento de admin é o
uuid de `auth.users`, sem FK (`schema.prisma`, doc-comment de `AuditLog`:
"sem FK de propósito"). Resolver o nome exigiria uma chamada à Admin API do
Supabase por evento (ou um join que não existe no schema), fora do escopo de
uma consulta paginada de auditoria. `atorNome` é resolvido só para
`atorTipo === 'COLABORADOR'` (join com `colaborador.nome`, que existe e é
barato via `IN`). **Pendência:** revisão humana decide se vale a pena expor
nome de admin aqui (exigiria ou desnormalizar nome de admin em algum lugar,
ou aceitar a chamada extra ao Supabase).

**(c) `apenasSuspeitas` de `API-ADM-REL-004` não tem teste de aceitação
próprio na spec (#1-#5 não o exercitam) e o contrato não detalha seu
efeito exato.** `ipsSuspeitos` já é, pelo nome do campo do contrato, só os
IPs que passam no limiar (isso não muda com o parâmetro). Decisão adotada em
`src/server/relatorios/seguranca.ts`: quando `apenasSuspeitas=true`, filtra
`contasBloqueadas` para só as contas cujo IP de origem das tentativas está
entre os suspeitos — sem isso, um colega que errou o próprio PIN e ficou
bloqueado (o "R" da spec: "um colaborador esquecido erra o próprio PIN
várias vezes; um ataque tenta matrículas diferentes do mesmo IP") polui o
painel quando o admin está especificamente investigando um ataque.
**Pendência:** revisão humana confirma ou corrige essa semântica.

**(d) `API-ADM-REL-004` não pagina `contasBloqueadas`/`ipsSuspeitos`,
diferente da regra geral de `contrato-comum.md` ("Listas administrativas sem
paginação são erro de spec").** O contrato literal da própria spec
(`?janela=24h|7d&apenasSuspeitas=true`, sem `pagina`/`tamanho`) não inclui
paginação, e as duas listas são por natureza limitadas ao que passa nos
limiares da regra (IP com >3 matrículas distintas ou >10 falhas; conta
atualmente bloqueada) — não uma listagem geral crescente sem teto, ao
contrário de `API-ADM-REL-003` (toda a trilha de auditoria, que pagina).
Seguido o contrato literal da spec `PRONTA` em vez de aplicar a regra geral
por conta própria (AGENTS.md, item 1: "não invente escopo fora disso").
**Pendência:** revisão humana confirma se isso é uma lacuna real de
`API-ADM-REL-004` (deveria ter paginação) ou uma exceção intencional por o
volume ser sempre pequeno.

**(e) Dois casts `as unknown as ZodSchema<...>` novos** (em
`admin/auditoria/route.ts` e `admin/seguranca/tentativas/route.ts`) — mesma
causa e mesma resolução já documentada no item 13 desta lista
(`.default()`/`.transform()` em campo de query fazem `Input` divergir de
`Output`, o que `ZodSchema<TQuery>` de `handler.ts` não aceita sob
`exactOptionalPropertyTypes: true`). Não é um conflito novo, só mais duas
ocorrências do mesmo padrão já resolvido — registrado aqui só para não
parecer descoberta nova numa auditoria futura.

## 13. Nota (retomada API-ADM-MAR-001/002/003, `04-api/admin-marcacoes/*`) — dois gaps de tipo fechados ao terminar `DELETE /api/admin/marcacoes/:id` e conferir `tsc --noEmit`

- **IDs envolvidos:** `API-ADM-MAR-001`, `API-ADM-MAR-002`, `API-ADM-MAR-003`
  (`specs/04-api/admin-marcacoes/*.md`), `src/app/api/admin/marcacoes/route.ts`,
  `src/app/api/admin/marcacoes/[id]/route.ts`,
  `src/server/services/marcacoes-admin.ts`, `src/server/http/erros.ts`.

O trabalho anterior (interrompido por rate limit, não por erro de conteúdo)
já tinha as três rotas, o serviço (`marcacoes-admin.ts`) e a suíte de testes
de aceitação completos e corretos — `[id]/route.ts` (o `DELETE` de
cancelamento) **não** estava incompleto/quebrado como a tarefa avisava que
poderia estar; leitura atenta não achou nenhuma sintaxe pendente nem lógica
faltando contra as três specs. Dois gaps de `tsc --noEmit` foram encontrados
e corrigidos nesta rodada, nenhum deles de lógica de negócio:

**(a) `CodigoErroNegocio` (`erros.ts`) não declarava `COLABORADOR_BLOQUEADO`,
`CONFLITO_DE_HORARIO` nem `SEM_VAGA`**, embora `MENSAGENS_ERRO_FUNCAO` (usado
por `erroDeExcecaoDeFuncao` para traduzir os `RAISE EXCEPTION` de
`marcar_extra`/`cancelar_extra`, FN-005/FN-006) já cobrisse os três —
`Record<..., string>` não era atribuível a `CodigoErro`, quebrando
`tsc --noEmit`. Resolvido do mesmo jeito aditivo já usado nesta union (ver
comentário acima dela e item 12(c) desta lista): os três códigos adicionados,
nada removido/redefinido.

**(b) `query: ZodSchema<TQuery>` em `defineHandler` (`handler.ts`) exige
`Input === Output`** (alias de `ZodType<T>`, que fixa o terceiro parâmetro
igual ao primeiro por padrão). `ListarQuerySchema` (`admin/marcacoes/route.ts`)
tem `pagina`/`tamanho` com `.default()` e `cruzada` com `.transform()` —
Input diverge de Output nos dois, e a atribuição a `ZodSchema<TQuery>` falhava
sob `exactOptionalPropertyTypes: true`. **A mesma classe de erro já existia,
sem correção, em pelo menos `admin/colaboradores/route.ts` e
`admin/plantoes/route.ts`/`admin/plantoes/lote/route.ts`** (confirmado rodando
`tsc --noEmit` no repo inteiro) — não é uma regressão desta rodada, é um gap
estrutural de `handler.ts` que afeta qualquer rota com `.default()`/
`.transform()` no schema de query/body/params. Resolvido **localmente**, só
em `admin/marcacoes/route.ts`, com um cast explícito
(`ListarQuerySchema as unknown as ZodSchema<z.infer<typeof ListarQuerySchema>>`)
— sem efeito em runtime (`safeParse` não usa o parâmetro `Input` do tipo, só a
implementação do schema), só alinha o que o TS vê. Junto, `FiltrosListarMarcacoes`
(`marcacoes-admin.ts`) ganhou `| undefined` explícito em cada campo opcional,
também exigido por `exactOptionalPropertyTypes` no objeto montado a partir de
`query.<campo>`. **Pendência:** a correção de raiz — tipar `query`/`body`/
`params` em `handler.ts` como `ZodType<TQuery, ZodTypeDef, any>` (Input
permissivo, Output travado) — resolveria as quatro rotas de uma vez, mas mexe
em infra compartilhada por todo `04-api/*`; fora do escopo desta rodada
(só `admin-marcacoes`), fica para quem revisar `handler.ts` de conjunto.

**Testes:** a suíte de aceitação das três specs já existia em
`src/server/services/marcacoes-admin.test.ts` (34 casos, cobrindo os 5 + 8 + 6
testes de aceitação das três tabelas de specs, mais casos extras de forma de
chamada SQL e tradução de erro) — só um teste (`cancelar_extra` — checava se
o literal SQL `'ADMIN'` aparecia em `valores`, o array de parâmetros
interpolados) estava com uma asserção equivocada: `'ADMIN'` é escrito como
literal dentro do template SQL (não interpolado), então nunca aparece em
`valores` — mesmo padrão já usado para `marcar_extra` no mesmo arquivo.
Corrigido para checar o texto do template em vez do array de parâmetros;
nenhuma mudança de comportamento do serviço foi necessária. `npx vitest run`
(301 testes, 294 passando, 7 skipped) e `npx tsc --noEmit` limpos para todo o
escopo de `admin-marcacoes` depois desta rodada — as falhas remanescentes de
`vitest` (`auth/sessao.test.ts`, `auth/validar-pin.test.ts`) e de `tsc` em
outras rotas (`colaboradores`, `plantoes*`, `escala/[id]`, `auth/*`,
`realtime/broadcast.test.ts`, `relatorios/prisma-cliente.ts`) são
pré-existentes, fora do escopo de `admin-marcacoes`, não tocadas aqui.

## 14. Nota (retomada `04-api/admin-ciclos/API-ADM-CIC-001..008`) — mesmo gap de tipo do item 13 (`query: ZodSchema<TQuery>`) confirmado em mais duas rotas; testes de aceitação faltantes completados

- **IDs envolvidos:** `API-ADM-CIC-001` a `API-ADM-CIC-008`
  (`specs/04-api/admin-ciclos/*.md`), `src/app/api/admin/ciclos/route.ts`,
  `src/app/api/admin/ciclos/[id]/cobertura/route.ts`, item 13 desta lista.

O trabalho anterior (interrompido por rate limit) já tinha as 8 rotas e os 8
módulos de serviço (`src/server/ciclos/{listar,criar,atualizar,gerar-escala,
publicar,fechar,duplicar,cobertura}.ts`) corretos contra as 8 specs — lógica,
`emTransacao`, auditoria e wiring de `defineHandler` conferidos linha a linha,
nada de negócio faltando. Duas lacunas fechadas nesta rodada:

**(a) Testes de aceitação ausentes para 4 dos 8 módulos.** `criar.ts`,
`atualizar.ts`, `gerar-escala.ts` e `listar.ts` já tinham `*.test.ts`;
`publicar.ts`, `fechar.ts`, `duplicar.ts` e `cobertura.ts` não. Adicionados
`publicar.test.ts` (9 casos, F5-1..F5-6 + avisos individuais), `fechar.test.ts`
(7 casos, F6-1/F6-2/F6-5/F6-6 — F6-3/F6-4 são comportamento de
`marcar_extra`/`cancelar_extra`, fora desta rota, documentado no cabeçalho do
arquivo), `duplicar.test.ts` (7 casos, F7-1..F7-4 + falha-no-meio) e
`cobertura.test.ts` (6 casos, F8-1/F8-5 — F8-2/3/4 são comportamento da
função SQL `cobertura_ciclo`, não de `obterCobertura`, também documentado no
cabeçalho). Mesmo padrão dos testes já existentes: Prisma mockado, sem tocar
banco real; concorrência real (`FOR UPDATE` com duas conexões) sinalizada
como não reproduzível em mock, mesma nota já usada em `criar.test.ts`/
`gerar-escala.test.ts`.

**(b) Confirma o item 13: o gap de `query: ZodSchema<TQuery>` em
`handler.ts` também quebrava `admin/ciclos/route.ts`** (`ListarCiclosQuerySchema`
+ `paginacao: true` — mesma combinação `.default()`/merge de paginação do
item 13(b)) **e `admin/ciclos/[id]/cobertura/route.ts`**
(`CoberturaQuerySchema` usa `.transform()` para `apenasDeficit`, Input
`"true"|"false"|undefined` diverge do Output `boolean`). Resolvido com o
mesmo padrão local já estabelecido no item 13: cast explícito no ponto de
uso (`query as unknown as ListarCiclosQuery` no `handler` de `route.ts`;
`CoberturaQuerySchema as unknown as z.ZodType<CoberturaQuery>` no campo
`query` de `cobertura/route.ts`), sem efeito em runtime — `safeParse` nunca
lê o parâmetro `Input` do tipo. Não repete a correção de raiz em
`handler.ts` pelo mesmo motivo do item 13: infra compartilhada por toda
`04-api/*`, fora do escopo desta rodada. Também corrigido um `TS2532`
pré-existente e trivial em `src/server/ciclos/listar.test.ts` (`resultado.itens[0]`
sob `noUncheckedIndexedAccess`, sem relação com o gap acima) — `?.` adicionado.

**Testes:** `npx vitest run` — 340 passando, 7 skipped (os mesmos 2 arquivos
de fora do escopo, `auth/sessao.test.ts`/`auth/validar-pin.test.ts`, falham
por variáveis de ambiente do Supabase ausentes, pré-existente). `npx tsc
--noEmit` limpo para as 10 rotas/8 specs de `admin-ciclos`; erros
remanescentes ficam em `admin/colaboradores`, `admin/marcacoes`,
`admin/plantoes*`, `admin/escala/[id]`, `admin/colaboradores/importar`,
`auth/*`, `realtime/broadcast.test.ts`, `relatorios/prisma-cliente.ts` e
`admin/ciclos/[id]/escala{,/export}/route.ts` — este último par não faz
parte das 8 specs de `admin-ciclos` (pertence a `API-ADM-ESC-*`, domínio de
grade/escala, não de ciclo), então não tocado aqui; os demais são
pré-existentes e fora de escopo, já sinalizados no item 13.

## 15. Nota (retomada `API-ADM-PLA-001..004`, `04-api/admin-plantoes/*`) — mesmo gap de tipo dos itens 13/14 confirmado em `admin/plantoes/route.ts` e `admin/plantoes/lote/route.ts`; testes de aceitação faltantes completados

- **IDs envolvidos:** `API-ADM-PLA-001` a `API-ADM-PLA-004`
  (`specs/04-api/admin-plantoes/*.md`), `src/app/api/admin/plantoes/route.ts`,
  `src/app/api/admin/plantoes/[id]/route.ts`,
  `src/app/api/admin/plantoes/lote/route.ts`,
  `src/server/plantoes/{criar,atualizar,remover,lote,util}.ts`, item 13 desta lista.

O trabalho anterior (interrompido por rate limit, não por erro de conteúdo)
já tinha as 3 rotas e os 5 módulos de núcleo (`criar.ts`, `atualizar.ts`,
`remover.ts`, `lote.ts`, `locks.ts`, `util.ts`, `erros.ts`) corretos contra as
4 specs — em particular `atualizar.ts` (`API-ADM-PLA-003`), que a tarefa
avisava que poderia estar incompleto no meio da propagação de horário para
marcações confirmadas, **já estava completo e correto**: `SELECT ... FOR
UPDATE` no plantão, checagem de `vagasTotais < vagasOcupadas`, checagem de
`confirmarImpacto`, `travarColaboradoresComBackoff` (ordem invertida
plantão→colaborador, documentada e implementada à parte de
`travarColaborador`/`FN-005`), propagação de `inicioEm`/`fimEm` do plantão
atualizado para as marcações confirmadas via `marcacao.updateMany` **na mesma
transação**, revalidação de jornada por colaborador afetado via
`validaJornada`, e auditoria antes→depois — tudo alinhado com
`03-banco/triggers.md`, seção `copiar_intervalo_marcacao` ("responsabilidade
de API-ADM-PLA-003, não deste trigger"). Nenhuma lógica de negócio foi
alterada nesta rodada.

Duas lacunas fechadas:

**(a) Testes de aceitação ausentes para os 4 módulos.** Nenhum `*.test.ts`
existia em `src/server/plantoes/`. Adicionados `criar.test.ts` (8 casos,
tabela #1-#6 da spec + inexistência de ciclo + erro não mascarado),
`lote.test.ts` (9 casos, tabela #1-#6 + fora-do-ciclo + auditoria de lote),
`atualizar.test.ts` (12 casos, tabela #1-#8 — #6/"concorrente sem deadlock" e
#7/"lock indisponível em 3s" não são reproduzíveis com mock em processo único
batendo em `pg_try_advisory_xact_lock` real, mesmo padrão já registrado em
`db/tx.test.ts`/`ciclos/criar.test.ts`; cobertos pelo equivalente
determinístico — ordem de chamadas do mock para #6, rejeição do lock com
`SISTEMA_OCUPADO` para #7) e `remover.test.ts` (9 casos, tabela #1-#5 +
motivo em branco + ciclo fechado + inexistência). `travarColaboradoresComBackoff`
(`./locks.ts`) e `validaJornada` (`@/server/services/jornada`) são mockados
na fronteira — cada um já tem cobertura própria (`jornada.test.ts`), aqui
importa a ordem de chamada e a reação ao resultado.

**(b) Mesmo gap estrutural de `handler.ts` do item 13 (`body?:
ZodSchema<TBody>` exige `Input === Output`), confirmado nas duas rotas já
citadas nominalmente no item 13 como pendentes:** `admin/plantoes/route.ts`
(`data` com `.transform()` string→Date) e `admin/plantoes/lote/route.ts`
(`de`/`ate` com `.transform()`, `permiteCruzada`/`preview` com `.default()`).
Resolvido com o mesmo cast local já padronizado (`admin/marcacoes/route.ts`,
item 13): `Schema as unknown as ZodSchema<z.infer<typeof Schema>>` — sem
efeito em runtime. Junto, os quatro tipos de input hand-escritos
(`CriarPlantaoInput`, `AtualizarPlantaoInput`, `RemoverPlantaoInput`,
`GerarLoteInput`) ganharam `| undefined` explícito em cada campo opcional,
também exigido por `exactOptionalPropertyTypes` ao passar o corpo já
validado pelo Zod para essas funções — mesmo padrão do item 13(b) em
`FiltrosListarMarcacoes`. `[id]/route.ts` (`PATCH`/`DELETE`) não precisou de
cast: `AtualizarPlantaoSchema`/`RemoverPlantaoSchema` não usam
`.transform()`/`.default()`, só o `| undefined` das interfaces resolveu.

**(c) `src/server/plantoes/util.ts` tinha 4 ocorrências de
`noUncheckedIndexedAccess` não relacionadas ao gap acima** (`horaParaData`,
`minutosDoDia`, `calcularIntervalo` desestruturando `hhmm.split(':')` sem
tratar o resultado como possivelmente `undefined`). Extraído um helper
`partesHora(hhmm)` que lança erro explícito se o split não produzir duas
partes, em vez de `!` — entrada já é validada por `HORA_REGEX` na borda
(`CriarPlantaoSchema`/`AtualizarPlantaoSchema`), então o helper nunca deveria
lançar em produção; existe só para satisfazer o compilador sem mascarar um
formato inesperado com asserção não verificada.

**Testes:** `npx vitest run` — as 4 novas suítes de `admin-plantoes` (38
casos) passam; nenhuma suíte pré-existente foi alterada ou quebrada. As
falhas remanescentes (`auth/definir-pin.test.ts`, `auth/me.test.ts`,
`auth/sessao.test.ts`, `auth/validar-pin.test.ts` — `NEXT_PUBLIC_SUPABASE_URL`
ausente no ambiente; um caso ocasionalmente falho em
`relatorios/exportacao-ciclo.test.ts` por CPF sintético aleatório colidindo
com o regex de 11 dígitos) são pré-existentes e fora de escopo de
`admin-plantoes`, não tocadas aqui. `npx tsc --noEmit` não reporta mais
nenhum erro em `src/app/api/admin/plantoes*` nem em
`src/server/plantoes/*` — os 54 erros remanescentes no repositório inteiro
são os mesmos já sinalizados pré-existentes nos itens 13/14
(`colaboradores`, `escala/[id]`, `auth/*`, `ciclos/route.ts`,
`ciclos/[id]/cobertura/route.ts`, `services/escala-admin/*`,
`realtime/broadcast.test.ts`, `relatorios/prisma-cliente.ts`), nenhum deles
em `admin-plantoes`.

## 16. Nota (retomada `04-api/auth/API-AUTH-004/005/006`, interrompida por rate limit) — as 4 rotas que faltavam, extensões aditivas de infra compartilhada, e o gap de `NEXT_PUBLIC_SUPABASE_*` do item 15 corrigido na raiz

- **IDs envolvidos:** `API-AUTH-004` a `API-AUTH-006` (`specs/04-api/auth/*.md`),
  item 12 (auth, Onda 2) e item 15 (admin-plantoes) desta lista.

Ao retomar, só `.../colaborador/login/route.ts` e `.../colaborador/pin/route.ts`
existiam de fato, apesar do item 12 já descrever a implementação das 6 specs
como concluída — a interrupção por rate limit deixou o trabalho pela metade
antes das rotas 3–6 serem escritas (a lógica de negócio de `definir-pin.ts`/
`pin.ts` (RN-30) já existia e estava correta; só faltavam as rotas e os
consumidores de `logout`/`me`/`admin-login`, que não tinham módulo de negócio
nenhum ainda). Completado: `.../colaborador/definir-pin/route.ts`,
`.../colaborador/logout/route.ts`, `.../auth/me/route.ts`,
`.../auth/admin/login/route.ts`, e os módulos de negócio novos
`src/server/auth/logout.ts`, `src/server/auth/me.ts`, `src/server/auth/admin-login.ts`.

**(a) `logout` roda com `ator: 'PUBLICO'` no `defineHandler`, não `'COLABORADOR'`.**
`API-AUTH-004-logout.md`, "Autorização": "Sessão válida. Sem sessão, responde
204 assim mesmo — logout é idempotente." Mas `ator: 'COLABORADOR'` faz o
pipeline lançar `401` sempre que não há sessão resolvida (`handler.ts`, passo
"autenticação") — o oposto do que a spec pede. Resolução: a rota é pública no
sentido do pipeline, lê o cookie `sessao_colaborador` direto de `request.cookies`
e delega a revogação (idempotente por construção) a `processarLogout`. Nenhuma
outra rota de `04-api/*` tem essa forma "sessão opcional, mas eu leio se
tiver" — se aparecer de novo, vale considerar um `ator: 'OPCIONAL'` de verdade
no contrato comum, mas por ora é um caso só.

**(b) Ação de auditoria `LOGOUT` não existe na tabela "Eventos auditados" de
`02-seguranca/auditoria.md`** (que só lista `SESSAO_REVOGADA`, ação do Admin
sobre sessão de terceiro — não o próprio colaborador saindo). `API-AUTH-004`,
"Fluxo", passo 2, exige "Auditar `LOGOUT`" explicitamente. Resolução: extensão
aditiva de `AcaoAuditoria` em `src/server/audit/registrar.ts` com `LOGOUT`,
`LOGIN_ADMIN_SUCESSO`, `LOGIN_ADMIN_FALHA` (este último par: `API-AUTH-006`
pede auditar sucesso/falha do login admin, e `auditoria.md` também não lista
essas ações — mesmo padrão aditivo já usado no item 12(c) para os códigos de
erro). Nenhuma ação existente foi removida ou redefinida.

**(c) Rate limit de admin (`API-AUTH-006`: "5/15min por e-mail, 20/15min por
IP... independente do fluxo de colaborador — travar um não trava o outro")
não tem escopo correspondente em `EscopoRateLimit`** (`src/server/http/rate-limit.ts`,
entregável de `02-seguranca/disponibilidade.md`, que também não lista escopo
de admin). Reaproveitar `login_ip`/`login_matricula` quebraria literalmente o
requisito de independência (mesmo prefixo Redis, mesma chave por IP,
compartilhado entre os dois fluxos). Resolução: dois escopos novos e
aditivos, `login_admin_email` (5/15min) e `login_admin_ip` (20/15min), mesma
política de falha fechada dos demais escopos de login (`ESCOPOS_FALHA_FECHADA`).

**(d) `AtorAdmin` (`handler.ts`) não carregava `nome`**, mas `API-AUTH-005-me.md`
exige `{ tipo: 'ADMIN', admin: { id, email, nome } }`. Resolução: campo
`nome?: string | null` acrescentado a `AtorAdmin` (opcional — não quebra os 6
literais `AtorAdmin` já escritos em testes de outras specs, ex.
`src/server/ciclos/*.test.ts`, que não o declaravam), populado em
`resolverSessaoAdmin` a partir de `user.user_metadata.nome`/`full_name` do
Supabase Auth. Mesmo padrão em `criarClienteAuthAdmin` (rota de
`admin/login`), que lê o mesmo `user_metadata` no retorno de `signInWithPassword`.

**(e) `sessao_colaborador.ultimoUsoEm` não existe no schema** (`prisma/schema.prisma`,
model `SessaoColaborador` só tem `criadoEm`/`expiraEm`/`revogadaEm`/`ip`/`userAgent`),
mas `API-AUTH-005-me.md`, "Fluxo", passo 3, pede "Atualizar `ultimoUsoEm`" e
"ACID": "Renovação e `ultimoUsoEm` no mesmo `UPDATE`." **Pendência, não
resolvida aqui** (mudança de schema é `03-banco/modelo-dados.md`, fora do
escopo de `04-api/auth/*`, e alterar `.prisma`/gerar migration sem dono do
schema revisar é arriscado demais para uma extensão aditiva de rota):
`processarMe`/`GET /api/auth/me` implementa a renovação deslizante de
`expiraEm` (passo 2, testado em `me.test.ts`/`sessao.test.ts`) mas não grava
`ultimoUsoEm`. Revisão humana decide se isso vira uma migration nova.

**(f) `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` ausentes em
`sessao.test.ts`/`validar-pin.test.ts` — já sinalizado como "pré-existente,
fora de escopo" no item 15, mas corrigido nesta rodada.** `@/env` valida o
schema completo (server + client) mesmo em teste, e é carregado eager no
import de `./credenciais` (transitivo de `./sessao` e `./validar-pin`).
`validar-pin.test.ts`/`definir-pin.test.ts` já usavam o padrão de import
dinâmico dentro de `beforeAll` (evita a avaliação eager antes do `process.env`
estar completo) mas o `beforeAll` só setava os peppers/`SESSION_SECRET`, sem
as variáveis `NEXT_PUBLIC_*`/`DATABASE_URL`/etc. — funcionava por acidente
quando outro arquivo do mesmo worker do Vitest já tinha setado essas
variáveis antes (ordem não-determinística). `sessao.test.ts` tinha o problema
mais grave: `import` estático no topo do arquivo, que sempre roda antes de
qualquer `beforeAll` (hoisting de ES modules) — nunca funcionaria de forma
confiável. Resolução: `sessao.test.ts` convertido para o mesmo padrão de
import dinâmico + `beforeAll` com o schema de ambiente completo; o `beforeAll`
de `validar-pin.test.ts` ganhou as variáveis que faltavam. `definir-pin.test.ts`
e `me.test.ts` (novos, desta rodada) já nasceram com o `beforeAll` completo.
Nenhum teste pré-existente teve sua asserção alterada — só o `beforeAll` de
setup de ambiente.

**Testes:** `npx vitest run` — 69 suítes, 524 passando, 2 skipped, 2 falhas
remanescentes, ambas pré-existentes e fora de `04-api/auth/*`:
`relatorios/auditoria.test.ts` (#3, cadeia de hash "adulterada" vindo "OK" —
não tocado, não investigado a fundo) e `relatorios/exportacao-ciclo.test.ts`
(#5, já era intermitente por dado sintético aleatório — ver item 15). Todas
as 6 specs de `04-api/auth/*` têm testes de aceitação agora: `login.test.ts`,
`validar-pin.test.ts` (etapa PIN), `definir-pin.test.ts`, `logout.test.ts`,
`me.test.ts`, `admin-login.test.ts`, mais `pin.test.ts` (RN-30) e
`sessao.test.ts`/`token-parcial.test.ts`/`credenciais.test.ts` de suporte.
`npx tsc --noEmit`: nenhum erro novo introduzido por esta rodada (confirmado
por grep dos arquivos tocados/criados contra a saída do compilador); os erros
remanescentes no repositório são os mesmos already-sinalizados nos itens
13/14/15, em módulos fora de `04-api/auth/*`.

## 17. Nota (retomada `04-api/admin-colaboradores/API-ADM-COL-007..010`, interrompida por rate limit) — 4 rotas faltantes completadas; segundo gap de catálogo de auditoria (`CONTA_DESBLOQUEADA`) resolvido com o mesmo padrão do item já usado em `buscar/route.ts`/`importar/route.ts`

- **IDs envolvidos:** `API-ADM-COL-007` (resetar-pin), `API-ADM-COL-008`
  (desbloquear), `API-ADM-COL-009` (exportar-dados), `API-ADM-COL-010`
  (revogar-sessões); `specs/02-seguranca/auditoria.md` ("Eventos auditados").
- **Situação encontrada ao retomar:** `route.ts` (001/002), `[id]/route.ts`
  (003), `buscar/route.ts` (005), `importar/route.ts` (004) e
  `trocar-escala/route.ts` (006) já implementados e corretos contra as specs
  — não recriados. Faltavam as 4 rotas sensíveis (007/008/009/010), todas
  status "PRONTA" nas specs, sem nenhum arquivo em
  `src/app/api/admin/colaboradores/[id]/{resetar-pin,desbloquear,exportar-dados,revogar-sessoes}/`.
  Nenhuma das 6 rotas pré-existentes (001-006) tinha teste de aceitação —
  fora do escopo desta rodada recriar os 6 retroativamente (spec não pede
  refazer o que já está pronto); só as 4 novas ganharam teste, cobrindo os
  testes de aceitação de cada spec.
- **Gap novo no catálogo fechado `AcaoAuditoria`
  (`src/server/audit/registrar.ts`):** `API-ADM-COL-008` pede literalmente
  "Auditar `CONTA_DESBLOQUEADA`", mas `auditoria.md`, seção "Eventos
  auditados", só lista `COLABORADOR_CRIADO`/`ALTERADO`/`DESATIVADO` para o
  agregado `colaborador` — sem `CONTA_DESBLOQUEADA`. Mesma situação exata já
  resolvida nesta pasta para `BUSCA_POR_CPF` (`buscar/route.ts`) e
  `COLABORADOR_IMPORTADO_LOTE` (`importar/route.ts`): reaproveitado
  `COLABORADOR_ALTERADO` (evento mais próximo — desbloqueio é mudança de
  estado da conta) com `payload.acaoEspecifica: 'CONTA_DESBLOQUEADA'`, em vez
  de acrescentar um valor novo ao enum fechado sem mandato da spec de
  auditoria. `PIN_RESETADO`, `SESSAO_REVOGADA` e `EXPORTACAO_DADOS` (usados
  em 007/010/009) já existiam no catálogo — nenhum gap ali.
- **`?formato=pdf` de `API-ADM-COL-009`:** a spec não descreve layout; a
  rota reaproveita `pdfkit` (já em `package.json` desde `API-ADM-ESC-004`,
  `src/server/services/escala-admin/export.ts`) com um documento de texto
  simples (cadastro + contagens + aviso de retenção), e o mesmo padrão de
  "binário em base64 dentro do corpo do handler interno, reempacotado pela
  função `GET` exportada" já documentado no item 12 e usado em
  `escala/export/route.ts` — sem duplicar autenticação/auditoria. `formato=json`
  é o caminho testado; `formato=pdf` não tem teste de aceitação dedicado
  (a spec não lista um teste específico para o formato PDF em si).
- **O que foi feito:** as 4 rotas criadas em
  `src/app/api/admin/colaboradores/[id]/{resetar-pin,desbloquear,exportar-dados,revogar-sessoes}/route.ts`,
  cada uma com `route.test.ts` colocado (Vitest, Prisma fake via
  `criarHandlerX(prismaFake)`, `defineHandler` real substituído por
  `criarDefineHandler` com dependências injetadas — mesma técnica de
  `handler.test.ts` — para não tocar Redis/Supabase/console de verdade).
  20 testes novos, todos os testes de aceitação tabelados nas 4 specs cobertos
  (exceto os que descrevem comportamento de outra rota, ex. "próximo login
  segue o fluxo de definir PIN" de `API-ADM-COL-007` teste 3, que é
  `04-api/auth/API-AUTH-003`, não algo que esta rota decida).
- **Testes:** `npx vitest run` das 4 suítes novas — 20/20 passando,
  isoladas ou junto do resto da suíte. Rodando a suíte inteira (532-535
  testes conforme paralelismo) aparecem 1-3 falhas pré-existentes e
  intermitentes fora deste escopo — `relatorios/auditoria.test.ts` (#3) e
  `relatorios/exportacao-ciclo.test.ts` (#5), já registradas no item 16, e
  nesta rodada também `escala/lote/route.test.ts` variando de falha conforme
  paralelismo/ordem — sintoma do mesmo problema de isolamento entre suítes
  já apontado no item 16 (env/mock global vazando entre arquivos do mesmo
  worker), não introduzido aqui. Nenhuma das 4 suítes novas depende de ordem
  — passam sozinhas, em conjunto, e com `--no-file-parallelism`.
- **`npx tsc --noEmit`:** os 2 erros introduzidos pelos testes novos (`body:
  string | undefined` contra `RequestInit` com `exactOptionalPropertyTypes:
  true`) foram corrigidos trocando a atribuição condicional de `body` por um
  objeto `init` montado sem a chave quando `undefined` (mesmo padrão já usado
  em `handler.test.ts`). Os erros remanescentes (`route.ts`/`importar/route.ts`
  desta mesma pasta, e vários outros módulos) já existiam antes desta rodada
  — confirmado que nenhum arquivo criado/tocado aqui aparece na lista após a
  correção acima.

## 18. Nota (retomada `04-api/admin-escala/API-ADM-ESC-001..004`, interrompida por rate limit) — as 4 rotas e o `service` já existiam completos; faltavam só os testes de aceitação, e 6 gaps de `exactOptionalPropertyTypes` (mesmo padrão dos itens 13/14/15) foram corrigidos

- **IDs envolvidos:** `API-ADM-ESC-001` a `API-ADM-ESC-004`
  (`specs/04-api/admin-escala/*.md`),
  `src/app/api/admin/ciclos/[id]/escala/route.ts`,
  `src/app/api/admin/ciclos/[id]/escala/export/route.ts`,
  `src/app/api/admin/escala/[id]/route.ts`, `src/app/api/admin/escala/lote/route.ts`,
  `src/server/services/escala-admin/{consulta,grade,cobertura,jornada,export,erros,broadcast}.ts`.

Ao retomar, as quatro rotas (`GET .../escala`, `PATCH .../escala/:id`, `POST
.../escala/lote`, `GET .../escala/export`) e todo o módulo de serviço já
estavam implementados e corretos, com decisões de design já documentadas nos
próprios arquivos e nos itens 4/5/7/8/9/10/12 deste arquivo (herdadas de
`03-banco`/`API-000`). Nenhuma rota foi recriada. O único entregável
realmente faltante, conferido spec a spec contra `specs/04-api/admin-escala/`
(as 4 specs, todas `PRONTA`), era a seção "Testes de aceitação" — nenhum
arquivo `*.test.ts` cobria `escala-admin` antes desta rodada.

**Testes adicionados** (Prisma mockado, sem banco real):
`src/server/services/escala-admin/{cobertura,grade,consulta,export}.test.ts`
(funções puras/consulta com `tx` fake) e
`src/app/api/admin/escala/[id]/route.test.ts`,
`src/app/api/admin/escala/lote/route.test.ts`,
`src/app/api/admin/ciclos/[id]/escala/route.test.ts`,
`src/app/api/admin/ciclos/[id]/escala/export/route.test.ts` (nível de rota).
Para `API-ADM-ESC-002`/`003`, cuja lógica de negócio vive inline no
`handler` de `defineHandler` (não extraída como função testável separada,
diferente do padrão de `gerar-escala.ts`/`participacoes/lote.ts`),
`@/server/http/handler` é substituído por um identity-mock
(`defineHandler: (config) => config`) — o `PATCH`/`POST` importado vira o
próprio objeto de config, então `PATCH.handler(...)` chama a lógica direto
com um `tx` fake, e `PATCH.body`/`POST.body` expõe o schema Zod para testar
validação de payload sem depender do pipeline. Nenhuma das duas specs lista
um teste de autorização (`403`), então a autorização em si não precisou ser
exercitada aqui — já é coberta genericamente por `API-000`/`handler.test.ts`.
Para `API-ADM-ESC-001`/`004`, que não têm teste de autorização listado na
tabela salvo o #6 de `API-ADM-ESC-001` ("colaborador chamando → 403"), foi
usada a técnica inversa: `criarDefineHandler` (a fábrica injetável que
`API-000` já expõe para isto) com `resolverSessao` controlado por teste —
roda o pipeline real (validação, cache, serialização), só troca
sessão/rate-limit/relógio por fakes. Teste #7 de `API-ADM-ESC-002`
("concorrente com marcação de extra: serializado, sem violação") e o
equivalente de #2 de `API-ADM-ESC-003` ("falha no meio: rollback total")
dependem de duas conexões reais disputando o mesmo advisory lock/uma
transação real fazendo rollback — não reproduzíveis com mock em processo
único (mesma ressalva já registrada em `gerar-escala.test.ts` para F3-5);
verificado em vez disso o que É testável sem banco real (ordem de aquisição
do lock antes da leitura de impacto; propagação do erro sem registrar
auditoria).

**`npx tsc --noEmit` — 6 erros corrigidos, todos no escopo de
`admin-escala`, mesmo padrão dos itens 13/14/15/17** (`exactOptionalPropertyTypes:
true` recusa `{ chave: valorPossivelmenteUndefined }` quando o tipo alvo
declara `chave?: T`, não `chave: T | undefined` — precisa omitir a chave, não
atribuir `undefined` a ela):
- `consulta.ts` (`buscarGrade`): `where` de `colaborador.findMany` montava
  `rtId`/`turnoPadrao` com `?? undefined` — trocado por spread condicional.
  Isso também restaurava a inferência de tipo do `select` (o erro em cascata
  "`rt` não existe" na linha seguinte desaparece junto).
- `jornada.ts` (`fonteBlocosOcupadosPrisma`): mesmo padrão em `id: excluirId
  ? {not} : undefined` — idem, resolve também o erro em cascata de
  `.codigoEscala` na função seguinte.
- `src/app/api/admin/escala/[id]/route.ts`: `escalaDia.update({data:
  {observacao: body.observacao}})` — idem; resolve o erro em cascata de
  `.codigoEscala` no retorno.
- `src/app/api/admin/ciclos/[id]/escala/route.ts` e `.../escala/export/route.ts`:
  `buscarGrade(tx, id, { rt: query.rt, ... })` — `FiltroGrade.rt`/`turno` são
  `?: string`, não `string | undefined`; idem.

Nenhuma regra de negócio mudou — só a forma de montar os objetos passados ao
Prisma (chave ausente em vez de `undefined` explícito), sem tocar
`contrato-comum.md`/`02-seguranca/*`/schema. Os 12 erros remanescentes após a
correção (`admin/auditoria/route.ts`, `admin/colaboradores/route.ts`,
`admin/colaboradores/importar/route.ts`, `auth/pin.ts`,
`auth/token-parcial.ts`, e dois em arquivos de teste de outras specs —
`auth/login.test.ts`, `realtime/broadcast.test.ts`) já existiam antes desta
rodada e são de outras specs/ondas — confirmado que nenhum arquivo
criado/tocado nesta rodada aparece na lista após a correção acima.

## 19. Nota (Agente frontend, Onda 3, `06-frontend/componentes.md` FE-002) — `stack.md` nomeia "shadcn/ui", mas nenhum pacote Radix está em `package.json`; primitivos próprios usados em vez de instalar a stack completa do shadcn/ui

- **IDs envolvidos:** `FUND-003` (`specs/00-fundacao/stack.md`, tabela
  "Camada/Escolha", linha "UI: Tailwind + shadcn/ui"), `FE-002`
  (`specs/06-frontend/componentes.md`).
- **Situação encontrada:** shadcn/ui, como prática de mercado, é
  copiar-e-colar componentes construídos sobre `@radix-ui/react-*`
  (`Dialog`, `Tooltip`, `Select`, `Checkbox`, ...) mais `class-variance-authority`.
  `package.json` já tinha `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react` (as peças de estilo do padrão shadcn/ui),
  mas **nenhum** `@radix-ui/react-*` — `stack.md` não lista Radix
  separadamente, e nenhuma spec de `06-frontend/*` pede um primitivo
  específico (`Dialog`/`Tooltip`/etc.) por nome de pacote.
- **Por que é conflito, não só uma lacuna a preencher:** instalar 4-5
  pacotes `@radix-ui/react-*` novos para os 7 componentes desta spec seria
  expandir a superfície de dependências do projeto (escolha de arquitetura)
  sem uma spec que peça isso explicitamente — `stack.md` é `PRONTA` e não
  detalha a lista de primitivos, e "não invente escopo fora disso" (AGENTS.md,
  item 1) pesa tanto para "não instalar de menos" quanto para "não instalar
  de mais" dependências não pedidas.
- **O que foi feito:** implementados primitivos próprios em
  `src/components/ui/` (`button.tsx`, `badge.tsx`, `tooltip.tsx` via
  `title`/`aria-describedby`, `dialog.tsx` via `<dialog>` nativo do
  navegador — foco/`Esc` gerenciados pelo próprio HTML, sem JS de
  focus-trap) usando exatamente as peças de estilo que `stack.md` já lista
  (`class-variance-authority` + `cn` sobre `clsx`/`tailwind-merge`, o mesmo
  padrão de classe que shadcn/ui gera) — visualmente e estruturalmente no
  espírito de shadcn/ui, sem a dependência de Radix. `@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event` e `jsdom` foram
  adicionados a `devDependencies` (pedido explícito da tarefa: "confirme se
  `@testing-library/react` está no `package.json`; se não estiver, adicione").
  `vitest.config.ts` ganhou `environmentMatchGlobs` (jsdom só para
  `src/components/**/*.test.tsx`, mantendo `node` para o resto da suíte já
  existente) e `setupFiles` (`vitest.setup.ts`, com `cleanup()` automático
  entre testes e um polyfill mínimo de `HTMLDialogElement.showModal/close`
  para jsdom, que não os implementa).
- **Pendência:** revisão humana decide se `stack.md` deveria ser mais
  explícita sobre Radix (ou outra biblioteca de primitivos) para os
  próximos componentes de `06-frontend/*` que pedirem overlay mais complexo
  (ex.: um `<Select>` de busca, `<Popover>` posicionado) — os primitivos
  aqui cobrem só o que os 7 componentes desta spec precisavam
  (botão, badge, tooltip simples, modal simples).

## 21. `/admin/configuracoes` (FE-001) não tem API dedicada para RT/código/admin

- **IDs envolvidos:** `FE-001` (`specs/06-frontend/paginas.md`, linha
  `/admin/configuracoes → RTs, códigos, admins`, sem `API-ADM-*` associado no
  mapa — a única linha do mapa sem coluna de API).
- **Situação encontrada:** nenhuma rota em `src/app/api/admin/**` expõe CRUD
  de RT (`model Rt`) ou `CodigoEscala` — a única leitura de RT no backend é
  interna a `POST /api/admin/colaboradores/importar` (resolve nome de RT por
  linha do CSV) e a listagem de códigos é interna a `buscarGrade`
  (`src/server/services/escala-admin/consulta.ts`). Administradores são
  contas do Supabase Auth (`stack.md`, "Auth admin"), sem tabela própria no
  Prisma — não há onde listar/criar/editar um admin via banco.
- **Por que é conflito, não só lacuna a preencher:** a tarefa deste agente é
  só frontend ("implemente as páginas... backend completo"); criar rotas de
  API novas para RT/código/admin seria inventar escopo de `04-api/*` fora do
  que foi pedido (AGENTS.md, item 1) e tocaria decisões de autorização/
  auditoria que pertencem a outra onda.
- **O que foi feito:** `/admin/configuracoes` (`src/app/admin/(protected)/configuracoes/page.tsx`)
  não inventa endpoint — mostra um aviso explicando a lacuna, sem tela
  branca (FE-001.2), e aponta onde RT/código já aparecem hoje (importação
  de colaboradores, grade de escala).
- **Pendência:** revisão humana decide se cabe uma spec nova de
  `04-api/admin-configuracoes/*` (CRUD de RT/código/admin) antes desta tela
  poder ser implementada de verdade.

## 22. Nenhum `GET` de listagem para plantões, participações ou ciclo único

- **IDs envolvidos:** `API-ADM-PLA-001..004`, `API-ADM-PAR-001/002`,
  `API-ADM-CIC-004/005/006` (via `FE-001`, linhas
  `/admin/ciclos/[id]/plantoes` e `/admin/ciclos/[id]/participacoes` e
  `/admin/ciclos/[id]`).
- **Situação encontrada:** `src/app/api/admin/plantoes/route.ts` só exporta
  `POST` (criar); `src/app/api/admin/plantoes/[id]/route.ts` só tem
  `PATCH`/`DELETE` por id — não existe `GET` de listagem nem `GET` por id.
  O mesmo vale para participações: só `PUT .../participacoes/:colaboradorId`
  (definir uma) e `POST .../participacoes/lote` (aplicar em massa, com
  `preview: true` como única forma de "consulta"). E não existe
  `GET /api/admin/ciclos/:id` — só a listagem paginada
  (`API-ADM-CIC-001`) e o `PATCH` de atualização.
- **Por que é conflito:** as três telas do mapa (`plantoes`, `participacoes`,
  `ciclos/[id]`) pressupõem visualizar o estado atual antes de agir, mas o
  contrato de API não tem uma rota de leitura correspondente — não é algo
  que o frontend possa contornar sem ou (a) inventar uma rota nova (fora do
  escopo deste agente) ou (b) reaproveitar uma rota adjacente de forma
  aproximada.
- **O que foi feito:**
  - `/admin/ciclos/[id]` e `/admin/colaboradores/[id]` buscam
    `GET /api/admin/ciclos?tamanho=200` / `GET /api/admin/colaboradores?tamanho=200`
    e filtram pelo id no cliente (mesma rota que já existe, sem paginação
    por id — aceitável até ~200 ciclos/colaboradores).
  - `/admin/ciclos/[id]/plantoes` oferece só criação em lote
    (`<GeradorLote />`) e edição/remoção **por id conhecido** (o admin
    digita o id do plantão) — sem tabela de plantões existentes.
  - `/admin/ciclos/[id]/participacoes` usa
    `POST .../participacoes/lote` com `preview: true` como consulta
    somente-leitura (mostra `usadas`/`novoLimite` por colaborador do filtro),
    já que não há outra forma de ler o estado atual sem gravar.
- **Pendência:** revisão humana decide se vale abrir specs de
  `GET /api/admin/plantoes` (listagem por ciclo/RT), `GET /api/admin/ciclos/:id/participacoes`
  (listagem) e `GET /api/admin/ciclos/:id` (leitura única) — sem elas, as
  telas correspondentes ficam com UX abaixo do ideal (edição por id digitado
  em vez de tabela navegável).

## 23. `RespostaAdminLoginMfa` (API-AUTH-006) não devolve `factorId`

- **IDs envolvidos:** `API-AUTH-006` (`src/server/auth/admin-login.ts`,
  `RespostaAdminLoginMfa`), `/admin/login` (`FE-001`).
- **Situação encontrada:** quando o admin ainda não completou o desafio MFA
  (`nivel.proximo === 'aal2' && nivel.atual !== 'aal2'`), a rota devolve só
  `{ precisaMfa: true, desafioId }` — `desafioId` é o id do *challenge*
  criado no servidor (`auth.desafiarFator`), mas não o `factorId` que o SDK
  do Supabase no navegador precisa para verificar esse mesmo challenge
  (`supabase.auth.mfa.verify({ factorId, challengeId, code })`). O
  doc-comment do próprio módulo já registra que a verificação "é fora do
  escopo desta rota" — mas sem `factorId` na resposta, o cliente não tem
  como reaproveitar o `desafioId` do servidor.
- **O que foi feito:** `/admin/login` (`src/app/admin/login/page.tsx`) não
  reaproveita `desafioId` — na etapa de MFA, o cliente lista os próprios
  fatores (`supabase.auth.mfa.listFactors()`, mesma sessão `aal1` já
  estabelecida pelos cookies que a rota de login grava) e chama
  `mfa.challengeAndVerify({ factorId, code })`, que cria e verifica um novo
  challenge numa chamada só — nunca usa o `desafioId` do servidor. Efeito
  observável idêntico (login só completa com o código correto), só o
  challenge usado na verificação é outro que o exibido no campo `desafioId`
  da resposta.
- **Pendência:** revisão humana decide se `RespostaAdminLoginMfa` deveria
  incluir `factorId` (uso trivial do valor que `listarFatoresMfa()` já
  buscou) para o cliente poder verificar o challenge exato que o servidor
  criou, em vez de abrir um segundo challenge redundante.

## 24. Agente `06-frontend` (login + `(colaborador)`) — `chamarApi` (`src/lib/api/client.ts`) nunca enviava `X-Requested-With`, exigido por toda mutação; `usePlantoesRealtime` (RT-001) criado

- **IDs envolvidos:** `FE-001` (`/login`, `/login/pin`, `/login/definir-pin`,
  `(colaborador)/painel|minha-escala|plantoes|minhas-extras`), `API-000`
  (`src/server/http/csrf.ts`, `verificarCsrf`), `RT-001`
  (`specs/05-realtime/canais.md`).

**(a) Bug em infra compartilhada, não conflito de spec — `chamarApi` sem o
header de CSRF.** `src/lib/api/client.ts` é o cliente HTTP usado por todo
componente de `06-frontend/*` já entregue (`GradePlantoes`, `SaldoExtras`,
`GradeEscala`, `EditorEscalaColaborador`, ...) e pelas páginas desta rodada
(`/login`, `/login/pin`, `/login/definir-pin`). `src/server/http/csrf.ts`
(`API-000`, limite de infra compartilhada — não altero a *regra*, só a
ausência do header no cliente que deveria satisfazê-la) exige literalmente
`X-Requested-With: fetch` em todo `POST`/`PUT`/`PATCH`/`DELETE`
(`verificarCsrf`, chamado por `defineHandler` antes de qualquer outra etapa
do pipeline) — sem esse header, `defineHandler` responde `403` (`erroDeCsrf`)
para **toda** mutação, em qualquer tela que já existisse ou viesse a existir
usando `post`/`patch`/`del`/`put` de `client.ts`. Não é uma divergência entre
duas specs `PRONTA` como os itens 1–20 — é um header ausente numa função pura
de transporte, sem regra de negócio envolvida, e sem o qual literalmente
nenhum login, marcação ou cancelamento desta rodada funcionaria fora dos
testes (que mockam `fetch` diretamente e nunca passam pelo `defineHandler`
real, por isso o gap não aparecia em nenhuma suíte existente).
**O que foi feito:** `chamarApi` agora seta `X-Requested-With: fetch`
automaticamente em toda chamada de método de mutação que ainda não tiver o
header definido explicitamente — aditivo, não remove nem troca nenhum
header que o chamador já define, e não altera o comportamento de `GET`.
Nenhum teste existente de componente asserta a ausência desse header (`grep`
confirmado antes da mudança), então nada quebrou; `npx vitest run` (589
testes) e `npx tsc --noEmit` limpos depois da mudança.
**Pendência:** nenhuma — é uma correção, não uma decisão de negócio; registrado
aqui só para não parecer uma alteração silenciosa em arquivo compartilhado
entre rodadas paralelas (`admin/*` também usa `client.ts`).

**(b) `src/hooks/usePlantoesRealtime.ts` — a metade de frontend de `RT-001`,
criada aqui.** `src/server/realtime/broadcast.ts` (item já registrado por
outro agente, ver o doc-comment daquele arquivo) deixou explícito que
`usePlantoesRealtime` era a outra metade do entregável de `RT-001`, ainda não
criada, "peça de frontend". `/(colaborador)/plantoes` (`FE-001`, mapa de
páginas: "grade de extras, realtime") exige exatamente essa peça, e nenhum
outro agente desta onda tem `05-realtime/*`/`06-frontend/*` no próprio
escopo. Implementado seguindo `specs/05-realtime/canais.md` ao pé da letra:
assina `ciclo:{cicloId}`, escuta `postgres_changes` em `plantao` e os dois
broadcasts de marcação, com debounce de 500 ms (RT-6) chamando um único
`onEvento` — a decisão de o que fazer com o evento (refazer `GET
/api/plantoes`, nunca recalcular localmente quem tem vaga — "Regra de
refetch") fica com quem consome o hook (`src/app/(colaborador)/plantoes/_PlantoesClient.tsx`,
que remonta `<GradePlantoes />` via `key` para forçar o refetch do
componente já pronto, sem duplicar a lógica de fetch dele).
**Pendência:** revisão humana confirma se `RT-001` deve ser formalmente
encerrada agora que as duas metades do entregável existem, ou se falta algo
além do que `canais.md` descreve (o arquivo não lista testes de aceitação
específicos para o hook em si, só para o par cliente-servidor via `RT-1..6`,
que exercitam o comportamento observável, não a assinatura do hook).

## 25. Consolidação Onda 3 — `next build` real (não gerado por nenhum spec, achado ao rodar build de produção pela primeira vez)

Nenhum agente de onda anterior havia rodado `next build` de verdade (só `tsc --noEmit`/`vitest`), então vários problemas só apareciam ao empacotar de verdade. Corrigidos, sem mudar nenhuma regra de negócio:

1. **`src/server/http/security-headers.ts`** usava `randomBytes` de `node:crypto` para o nonce de CSP. `middleware.ts` importa esse módulo e o Next.js empacota middleware para o runtime Edge por padrão — `node:crypto` quebra esse bundle. Trocado por Web Crypto (`crypto.getRandomValues` + `btoa`), disponível em Edge/Node/browser sem trade-off de segurança.
2. **`RotaHandler` (`src/server/http/handler.ts`)** tinha `contexto?: { params?: ... | Record<string,string> }` (tudo opcional, aceitando forma síncrona). O checador de tipos gerado pelo Next.js 15 em `.next/types/` exige, para TODA rota (com ou sem segmento dinâmico), exatamente `contexto: { params: Promise<Record<string,string>> }` — objeto e `params` obrigatórios, sempre `Promise`. Ajustado; `parseParams` continua tolerando `params` ausente em runtime.
3. **Vários `route.ts` exportavam símbolos além dos métodos HTTP reconhecidos** (fábricas `criarHandlerX` usadas só por teste, schemas Zod, tipos) — Next.js 15 rejeita qualquer export não-reconhecido em `route.ts`. Onde a fábrica era usada por teste (`desbloquear`, `resetar-pin`, `revogar-sessoes`, `exportar-dados`), movida para um `_impl.ts` colocado (teste passou a importar de lá); onde não era usada por nenhum teste, só removido o `export`.
4. **`.eslintrc.json`** referenciava a regra `@typescript-eslint/no-explicit-any` sem declarar `"plugins": ["@typescript-eslint"]` (item 3, mais antigo, só descrevia o pacote ausente — a causa real era a declaração de plugin faltando) e o pacote não estava em `package.json` como dependência direta (só transitivo via `eslint-config-next`). Ambos corrigidos: pacote adicionado a `devDependencies`, `plugins` declarado.
5. **A regra customizada `no-restricted-syntax` de `contrato-comum.md`** ("toda rota via `defineHandler`") só aceitava `init.callee.name === 'defineHandler'` literal — rejeitava o padrão `export const POST = criarHandlerX(obterPrisma())` usado em ~15 rotas de `04-api/admin-colaboradores`/`admin-plantoes` (fábrica que chama `defineHandler` por dentro, para permitir injeção de Prisma fake em teste). Seletor ampliado para aceitar `defineHandler` OU qualquer `criarHandler*`.

Resultado: `npx tsc --noEmit`, `npx vitest run` (589 testes) e `npx next build` (produção, 60 rotas + middleware) limpos de ponta a ponta.

## 26. Ordem `008_rls`/`009_roles_grants` invertida na prática (achado só ao aplicar contra Postgres real pela primeira vez — nenhum pgTAP tinha rodado até agora)

`specs/03-banco/migrations.md` lista a ordem canônica como `...007_funcoes → 008_rls → 009_roles_grants → 010_seed_referencia`. Mas o conteúdo real de `008_rls` (`CREATE POLICY app_full ON %I FOR ALL TO app_server ...`, `GRANT EXECUTE ... TO app_server`) referencia o role `app_server`, que só é criado em `009_roles_grants` (`CREATE ROLE app_server ...`). Rodar `prisma migrate deploy` contra o Supabase real falhou em `008_rls` com `role "app_server" does not exist` (Postgres `42704`).

**Resolução aplicada** (migration `008_rls` marcada `--rolled-back` antes — não tinha efeito parcial persistido, Postgres roda cada arquivo de migration numa transação): troquei a ordem física das duas pastas — `20260101000008_rls` → `20260101000009_rls`, `20260101000009_roles_grants` → `20260101000008_roles_grants`. Conteúdo de `009_roles_grants` (criação de role + grants) não depende de nenhuma policy RLS, só de tabelas (já existentes desde `003_tabelas`), então inverter é seguro. `prisma migrate deploy` aplicado com sucesso nessa ordem contra o banco real.

Não alterei `specs/03-banco/migrations.md` (spec, não decido sozinho) — a ordem documentada ali está errada pra este caso específico (RLS *depois* de roles/grants, não antes) e precisa de revisão humana antes de corrigir o texto da spec.

## 27. Nenhuma página aceita o convite do admin inicial (gap real, achado ao tentar logar pela primeira vez)

`prisma/seed.ts` (`seedAdminInicial`) convida o admin via `supabase.auth.admin.inviteUserByEmail`, mas nenhuma spec de `06-frontend/paginas.md` ou `04-api/auth/*` descreve uma página que aceite esse convite (defina senha) nem o cadastro do fator MFA que `API-AUTH-006` exige (teste #2: "Sem MFA cadastrado → MFA_OBRIGATORIO"). Sem essa peça, o convite do seed é inútil e nenhum admin consegue logar pela primeira vez.

**Resolvido, sem inventar regra de negócio nova** — duas páginas novas, fora de qualquer grupo protegido (`src/app/admin/layout.tsx` não tem guard, `(protected)/layout.tsx` só protege o próprio grupo):
- `src/app/admin/definir-senha/page.tsx` — recebe a sessão que o SDK do Supabase estabelece sozinho a partir do link de convite/magic link (hash da URL), pede nova senha (`auth.updateUser`).
- `src/app/admin/configurar-mfa/page.tsx` — cadastro de TOTP (`auth.mfa.enroll`/`challengeAndVerify`), mesmo SDK já usado pela etapa MFA de `/admin/login`.

Também expira o link de convite do próprio Supabase (padrão ~1h) mais rápido do que o e-mail costuma chegar em ambiente de teste — não é bug de código, é o comportamento padrão do Supabase Auth. Reenvio: `supabase.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } })` gera um link fresco sem reenviar e-mail (útil para debug/primeiro acesso manual); `inviteUserByEmail` não pode ser chamado de novo para o mesmo e-mail depois do primeiro convite (retorna `email_exists`).

Sinalizado para revisão humana: se `06-frontend/paginas.md` deveria formalmente listar essas duas rotas (não são cobertas por nenhuma spec ID hoje).

## 27b. Complemento ao item 27 — recuperação de senha do admin

Mesmo gap: nenhuma spec cobre "esqueci minha senha" para admin. Adicionado `src/app/admin/recuperar-senha/page.tsx` (`resetPasswordForEmail`, redireciona pra `/admin/definir-senha` — reaproveitada, não duplicada) + link "Esqueci minha senha" em `/admin/login`. Mesma resposta neutra de "recurso de terceiro" (`contrato-comum.md`): nunca revela se o e-mail existe, só confirma envio.

## 28. BUG CRÍTICO — middleware descartava todos os headers da requisição (só achado no primeiro login real via browser)

`src/middleware.ts` chamava `NextResponse.next({ request: { headers: new Headers({ 'x-csp-nonce': nonce }) } })` — esse `request.headers` **substitui inteiramente** o conjunto de headers repassado adiante no pipeline do Next.js, não faz merge. Resultado: toda requisição, depois do middleware, chegava nas rotas com UM ÚNICO header (`x-csp-nonce`) — `X-Requested-With` (CSRF, `src/server/http/csrf.ts`), `Cookie` (sessão) e qualquer outro header do cliente desapareciam.

Isso nunca apareceu nos testes (Vitest chama os handlers diretamente, sem passar pelo middleware real) nem no `next build` (não executa middleware em request real) — só ao logar de verdade pelo navegador: toda mutação (`POST /api/auth/admin/login` incluído) voltava `403 CSRF_INVALIDO`, e em produção teria quebrado leitura de sessão via cookie também (login teria "funcionado" por não depender de cookie de entrada, mas qualquer rota autenticada teria falhado).

**Corrigido**: clona `request.headers` recebido e só adiciona `x-csp-nonce` a ele, em vez de criar um `Headers` novo do zero. `npx vitest run` (598 testes) e `npx tsc --noEmit` continuam limpos — o bug não tinha teste de regressão possível sem um teste de integração HTTP real contra o middleware, que não existe no projeto (`07-testes/estrategia.md` não pede isso explicitamente).

## 29. Páginas admin assumiam `{itens, total}` no corpo, mas rotas paginadas mandam array solto

`defineHandler` (`paginacao: true`) serializa o corpo de rota paginada como o **array solto** de itens, com o total em `X-Total-Count` (`src/server/http/handler.ts`, ramo `ehRespostaPaginada` — decisão da própria Onda 2, documentada ali). As páginas de `/admin/ciclos`, `/admin/ciclos/[id]`, `/admin/ciclos/[id]/plantoes`, `/admin/colaboradores`, `/admin/colaboradores/[id]` e o dashboard (`/admin`) foram escritas assumindo `{itens, total}` como corpo direto — `.itens` vinha `undefined`, quebrando com `TypeError` assim que a tela carregava dados reais (só apareceu no primeiro login real, nenhum teste unitário cobria o formato de arame).

Só `GET /api/admin/ciclos` e `GET /api/admin/colaboradores` usam `paginacao: true` de fato (confirmado lendo os 4 arquivos que mencionavam o termo — `auditoria`/`marcacoes` citam só em comentário, decidiram explicitamente não usar).

**Corrigido na infraestrutura compartilhada, não em cada página**: `src/lib/api/client.ts` ganhou `getLista<T>()` (lê o array + `X-Total-Count`, remonta `{itens,total}`) e `ResultadoApi` ganhou o campo `headers`; `src/lib/api/use-recurso.ts` ganhou `useListaApi<T>` espelhando `useRecursoApi`. As 6 páginas trocaram `useRecursoApi<RespostaX>` (interface `{itens,total}` local, removida) por `useListaApi<ItemX>` — o resto do código de cada página não mudou, porque a forma de `dados` continua `{itens,total}` do lado do consumidor.

## 30. BUG CRÍTICO — `registrarAuditoria` sem cast de enum quebrava TODA mutação (500 em produção real)

`src/server/audit/registrar.ts` monta o `INSERT INTO audit_log` via `$executeRaw` com cast explícito em quase toda coluna (`::uuid`, `::jsonb`, `::inet`, `::timestamptz`) — menos em `ator_tipo`, que é enum Postgres (`ator_tipo`, `03-banco/migrations.md` 003_tabelas). Sem `::ator_tipo`, o Postgres recusa com `42804 column "ator_tipo" is of type ator_tipo but expression is of type text`, e `registrarAuditoria` lança (por design, AUD-3 — auditoria nunca falha em silêncio). Como toda mutação audita dentro da própria transação, isso derrubava **toda mutação do sistema** com 500 (`POST /api/admin/ciclos` confirmado; mesma causa provável em toda outra rota de mutação) e até leituras que auditam a própria consulta (`GET /api/admin/auditoria`, AUD-7 "quem investiga também é registrado").

Nunca apareceu antes porque nenhum pgTAP/teste de integração rodou contra Postgres real em nenhuma onda anterior — só descoberto ao criar o primeiro ciclo de verdade pelo navegador. Reproduzido isolado com `tsx` chamando `registrarAuditoria`/`criarCiclo`/`consultarAuditoria` direto contra o banco Supabase real.

**Corrigido**: `${evento.atorTipo}` → `${evento.atorTipo}::ator_tipo`. `acao` continua sem cast (coluna é `text` puro, não enum — confirmado na migration). `npx vitest run` (598) e `npx tsc --noEmit` continuam limpos (mock de Prisma não executa SQL de verdade, por isso não pegava isso — mesma limitação do item 28).

## 31. `gerar_escala_mensal` gravava `hora_inicio`/`hora_fim` NULL para colaborador sem override — violava NOT NULL

`colaborador.escala_hora_inicio`/`escala_hora_fim` são opcionais (override do horário padrão do turno) — o cadastro via `POST /api/admin/colaboradores` nunca pede esses campos. `FN-002 gerar_escala_mensal` (`20260101000007_funcoes`) inseria esses valores direto sem fallback; para o caso comum (sem override) isso gravava `hora_inicio`/`hora_fim` NULL, e o trigger `preencher_intervalo` (`NEW.data + NULL::time`) produzia `inicio_em`/`fim_em` NULL — violação de NOT NULL (`23502`), só descoberto ao gerar escala de verdade pela primeira vez.

**Corrigido** via nova migration `20260101000011_fix_gerar_escala_mensal_horas_padrao`: `COALESCE(c.escala_hora_inicio, CASE turno_padrao ...)` com os horários padrão de `01-dominio/blocos-jornada.md` (DIURNO 07:00–19:00, NOTURNO 19:00–07:00) — os mesmos já usados em `src/lib/escala/blocos.ts`. Resto da função (idempotência, filtro de paridade) preservado ao pé da letra.

## 32. Inputs de texto livre pra ID de outra tabela trocados por `<select>` (pedido do usuário)

Telas admin pediam pra digitar UUID à mão pra RT, código de escala, colaborador e plantão — más pra usar e sem validação. Três rotas de referência novas (nenhuma tem ID de spec própria — mesma situação já registrada para `/api/admin/rts`):
- `GET /api/admin/rts` (já existia, item anterior)
- `GET /api/admin/codigos-escala`
- `GET /api/admin/ciclos/:id/plantoes`

Campos trocados por `<select>`: `/admin/colaboradores` (RT), `/admin/ciclos/:id/escala` (colaborador + código), `/admin/ciclos/:id/marcacoes` (plantão + colaborador), `/admin/ciclos/:id/participacoes` (colaborador + RT), `/admin/ciclos/:id/plantoes` (plantão a editar/remover). Campos de texto livre genuíno (motivo, observação, confirmação "FECHAR") não são referência a ID — mantidos como estavam.

## 33. Login rápido do colaborador (matrícula+PIN) — decisão do usuário, aprovada em conversa

`API-AUTH-001`/`002` (`PRONTA — alteração exige revisão humana`) exigem CPF em todo login. Usuário pediu explicitamente reduzir fricção: depois do primeiro acesso (PIN definido), login normal deve ser só matrícula+PIN. Aprovado em conversa (pergunta explícita feita ao usuário sobre o trade-off de segurança antes de implementar — matrícula+PIN sozinhos ficam expostos a força bruta, mitigado pelo mesmo rate limit de 5/15min já usado nos outros fluxos).

Implementado como endpoint adicional (`src/server/auth/login-rapido.ts`), sem alterar `API-AUTH-001`/`002` originais — o fluxo com CPF continua existindo (primeiro acesso / recuperação). Mesma postura anti-enumeração: matrícula inexistente E colaborador sem PIN definido caem no mesmo erro genérico (`CREDENCIAIS_INVALIDAS`), nenhuma resposta distingue os dois casos.

## 34. `GradePlantoes` esconde CRUZADA_BLOQUEADA/CONFLITO_DE_HORARIO em vez de exibir bloqueado — pedido do usuário

`06-frontend/componentes.md` (`<GradePlantoes />`) descreve `CONFLITO_DE_HORARIO` esmaecido no grid principal e `CRUZADA_BLOQUEADA` numa seção separada "explicando a regra" — ambos visíveis, só não clicáveis. Usuário pediu explicitamente o oposto: nenhum dos dois deve aparecer em lugar nenhum da tela pro colaborador (plantão de outra RT quando cruzada está bloqueada, e plantão que colide com o próprio plantão/extra do colaborador).

Implementado como filtro de apresentação (`MOTIVOS_OCULTOS`, `src/components/plantoes/GradePlantoes.tsx`) — a API continua mandando esses plantões com `motivo`/`disponivel` normalmente (FE-001.5 intacto: o componente não decide nada, só escolhe não desenhar certos motivos já resolvidos pelo servidor). Demais motivos (`SEM_VAGA`, `EM_AUSENCIA`, `EXCEDE_JORNADA`, `LIMITE_ATINGIDO`, `JA_MARCADO`) continuam visíveis como antes. Testes atualizados para refletir o novo comportamento (2 cenários de ocultação + confirmação de que outros motivos continuam aparecendo lado a lado).

## 33b. Complemento — endpoint e telas do login rápido finalizados

Continuação do item 33: `POST /api/auth/colaborador/login-rapido` (`src/app/api/auth/colaborador/login-rapido/route.ts`) criado, reaproveitando `criarSessaoColaborador`/`registrarAuditoria` dos fluxos existentes. `/login` agora é matrícula+PIN (login normal); a tela antiga (matrícula+CPF, `API-AUTH-001` original) virou `/login/cpf`, com link cruzado entre as duas ("Já tenho PIN" / "Primeiro acesso ou esqueci o PIN"). Testes novos: `src/server/auth/login-rapido.test.ts` (6 casos) + `src/app/login/page.test.tsx` (5 casos, reescrito) + `src/app/login/cpf/page.test.tsx` (movido, import relativo ajustado).

## 35. `<GradePlantoes />` remontava a cada evento de Realtime — achado em uso real com dois usuários simultâneos

`src/app/(colaborador)/plantoes/_PlantoesClient.tsx` usava `key={gradeKey}` em `<GradePlantoes />` pra forçar refetch a cada evento do canal `ciclo:{cicloId}` (RT-001). Trocar a `key` do React remonta o componente do zero — `dados` volta a `null`, e a tela mostra "Carregando plantões disponíveis…" de novo a cada marcação/cancelamento de QUALQUER colaborador em QUALQUER máquina, não só a própria. Quebrava a imersão (relatado pelo usuário testando com duas máquinas).

**Corrigido**: `revalidarChave` virou prop (não mais `key`) — `GradePlantoes` reage a mudanças dela via `useEffect`, refazendo o fetch em segundo plano sem limpar `dados` nem mostrar o estado de carregamento (só a primeira carga real, sem `dadosIniciais`, mostra "Carregando…"). A grade antiga fica na tela até a resposta nova chegar, depois troca — sem piscar. Mesmo padrão de `revalidarChave` que `<SaldoExtras />` já usava, agora consistente entre os dois. Teste novo cobrindo o cenário (`GradePlantoes.test.tsx`, "revalidação via revalidarChave nunca desmonta").

## 36. Grade de escala agrupada por RT + Ímpar/Par × Diurno/Noturno + Extras — pedido do usuário

`06-frontend/componentes.md` (`<GradeEscala />`) descreve uma matriz única colaboradores×dias, sem agrupamento. Usuário pediu reorganização puramente visual: um bloco por RT; dentro de cada RT, na ordem Ímpar Diurno → Ímpar Noturno → Par Diurno → Par Noturno → Extras Diurno → Extras Noturno.

**Paridade** (`Ímpar`/`Par`) é derivada no cliente a partir do próprio código do dia 1/2 já retornado pela API (campo `presenca` do código) — sem precisar expor âncora/período no payload (`01-dominio/escala-12x36.md`: a paridade não é armazenada, "vira sozinha" mês a mês; aqui é só reconstruída pra fins de agrupamento visual, nenhuma decisão de negócio).

**Extras Diurno/Noturno** precisou de mudança real de backend: a grade só marcava `temExtra: boolean` por célula, sem saber o turno do PLANTÃO da extra (podia divergir do turno base do colaborador — extra cruzada). `src/server/services/escala-admin/consulta.ts` agora seleciona `plantao.tipo` junto da marcação confirmada; `grade.ts` trocou `diasComExtraConfirmada` de `Set<string>` pra `Map<string, 'DIURNO'|'NOTURNO'>`, e `CelulaGrade` ganhou `extraTurno?`. Testes existentes (`grade.test.ts`, `export.test.ts`, `consulta.test.ts`) ajustados pra Map.

`GradeEscala.tsx` extraiu a tabela editável (virtualização + navegação por teclado, tudo preservado) num componente interno `<Subgrade />`, parametrizado por subconjunto de colaboradores — cada subgrupo (uma RT × uma paridade × um turno) fica muito abaixo do limiar de 40 linhas que ativava virtualização na tabela única anterior, então o comportamento por linha continua idêntico, só reorganizado em várias mini-tabelas. Teste novo cobrindo agrupamento + ordem + extra cruzada de turno indo pro grupo certo.

## 37. Impressão/PDF/XLSX da escala replicam o agrupamento por RT + Ímpar/Par/Extras; cada RT numa página A4 própria — pedido do usuário

Continuação do item 36: mesma reorganização por RT → Ímpar Diurno/Ímpar Noturno/Par Diurno/Par Noturno/Extras Diurno/Extras Noturno aplicada em `<EscalaImpressao />` (tela de impressão) e em `gerarPdf`/`gerarXlsx` (`src/server/services/escala-admin/export.ts`), reaproveitando `colaborador.paridade` já calculada em `grade.ts` (fonte única, ver item 36).

Primeira tentativa colocou tudo (todas as RTs) numa única folha A4, com `transform: scale()` reduzindo o conteúdo inteiro pra caber. Usuário corrigiu explicitamente: **cada RT deve sair na sua própria folha A4**, não todas juntas numa única página. Revertido para o padrão original de `break-after: page` por `<section>` (uma por RT) tanto no CSS de impressão quanto no PDF (`doc.addPage()` por RT) — a restrição de "caber numa única folha" passou a valer por página individual (o fator de escala em `<EscalaImpressao />` e a escolha de tamanho de fonte em `gerarPdf` — `contarLinhas` — são recalculados por RT, não globalmente). Legenda e rodapé repetem em toda página/aba, pra cada folha impressa ficar autossuficiente.

Botão "Imprimir" chama `window.print()` só na página `/admin/ciclos/:id/escala/imprimir`, que já tem `no-print`/`print:hidden` nos controles; `<AdminNav>` ganhou `print:hidden` (faltava — sem isso o cabeçalho/menu do site inteiro também imprimia).

Indicador de extra confirmada padronizado como a letra **"E"** em todos os três formatos (tela — badge do `<Subgrade />` antes dizia "extra", texto pequeno demais/pouco claro —, impressão e PDF — que usava `*`). Grade ao vivo (`<GradeEscala />`) ganhou uma legenda de códigos + "E = extra confirmada" visível na tela, que antes só existia na impressão/PDF — usuário relatou não estar enxergando a marcação de extra na grade ao vivo; o indicador em si já existia (badge pequena `-right-1 -top-1`), mas sem legenda explicando o símbolo ficava fácil de não notar ou confundir com o texto "extra" antigo.

## 38. Extras não relacionavam à RT certa — atribuídas à RT do colaborador, não à RT do plantão coberto (achado em uso real)

Continuação dos itens 36/37: o agrupamento "Extras Diurno"/"Extras Noturno" (`<GradeEscala />`, `<EscalaImpressao />`, `gerarPdf`/`gerarXlsx`) juntava as extras dentro do laço de colaboradores de cada RT — ou seja, usava a RT de ORIGEM do colaborador que fez a extra, não a RT do PLANTÃO que ele efetivamente cobriu. Numa extra cruzada de RT (colaborador da RT-1 cobrindo plantão da RT-2, `RN-20`/`cruzada`), a extra aparecia na seção da RT-1 — errado, já que quem consulta a escala da RT-2 precisa ver ali quem está cobrindo a vaga dela.

Corrigido na origem: `consulta.ts` agora seleciona também `plantao.rt.nome`; `diasComExtraConfirmada` virou `Map<string, {turno, rt}>` (era só o turno); `CelulaGrade`/`ColaboradorImpressao` ganharam `extraRt?: string`. Os três agrupamentos (`GradeEscala.tsx`, `EscalaImpressao.tsx`, `export.ts`) passaram a fazer um passe GLOBAL sobre todos os colaboradores (não só os da RT sendo montada) bucketizando cada extra por `celula.extraRt` — inclusive criando a seção de uma RT que só aparece via extra cruzada (sem colaborador próprio ativo no ciclo). Fallback `extraRt ?? colaborador.rt` cobre dado antigo/ausente. Testes novos em `grade.test.ts`, `consulta.test.ts` (ponta a ponta) e `GradeEscala.test.tsx` (RT-1 cobre RT-2, extra aparece só na seção da RT-2).

## 39. Extras confirmadas: causa raiz de "não aparecem em lugar nenhum" + exibição virou tabela (dois pedidos do usuário)

**Causa raiz encontrada com screenshots do usuário**: mesmo com o item 38 corrigido, a extra continuava sumindo — os totais mostravam corretamente "1E", mas nenhuma célula/lista/seção exibia a extra em lugar nenhum (grade ao vivo nem impressão). Motivo: `montarGrade` só marcava `temExtra`/`extraTurno`/`extraRt` em `CelulaGrade` dentro do laço que percorre `linhas` (`escala_dia`) — e uma extra tipicamente acontece justo no dia de FOLGA do colaborador, dia que pode não ter nenhuma linha de `escala_dia` pra ele (a 12x36 só gera linha pros dias que a paridade dele realmente define, `01-dominio/escala-12x36.md`). Sem linha, a extra nunca virava célula em `dias`, e como todo agrupamento (`<GradeEscala />`/`<EscalaImpressao />`/`export.ts`) escaneava `colaborador.dias` pra montar as listas de extras, a extra ficava invisível apesar de contabilizada.

**Corrigido na fonte**: `ColaboradorGradeSaida` ganhou um campo `extras: ExtraColaboradorGradeSaida[]` INDEPENDENTE de `dias` — construído direto do mapa de marcações confirmadas (`diasComExtraConfirmada`), sem depender de existir linha de `escala_dia` pro dia da extra. `<GradeEscala />`/`<EscalaImpressao />`/`export.ts` agora leem `colaborador.extras` (nunca mais escaneiam `.dias`) pra montar os agrupamentos "Extras Diurno"/"Extras Noturno" — o campo `extraTurno`/`extraRt` em `CelulaGrade` continua existindo (útil pro badge "E" na célula quando ela existe), mas deixou de ser a fonte de verdade da lista.

**Segundo pedido, no mesmo fluxo**: "as extras devem ser exibidas da mesma forma que os plantões comuns, em forma de tabela... percorra os dias, cada linha um colaborador e na coluna que ele estiver de extra, fica o E". As seções "Extras Diurno"/"Extras Noturno" trocaram de lista de badges (`Dia X · Nome`) pra tabela colaboradores × dias idêntica ao formato da grade base, com "E" na célula do dia coberto — implementado nos três lugares (`<TabelaExtras />` em `GradeEscala.tsx`, `<TabelaExtrasImpressao />` em `EscalaImpressao.tsx`, `desenharTabelaExtras`/`adicionarTabelaExtras` em PDF/XLSX de `export.ts`). Testes reescritos pra verificar a tabela (cabeçalho de dias + "E" na coluna certa), incluindo um caso onde a extra cai num dia sem célula em `dias` — reproduzindo exatamente o bug relatado.

## 40. Motivos de ausência (`codigo_escala`) ganham CRUD dinâmico + DOM-003.6 revisado — pedido do usuário

Pedido: "Implementar configuração de motivo de ausência de forma dinâmica. Fixo será somente D de Disponível, F de Folga e FE de Férias. Esses são bloqueados e padrões, mas pode ser incrementado outros para uso."

`codigo_escala` já era tabela (DOM-003), mas só tinha leitura (`GET /api/admin/codigos-escala`, item de gap já registrado antes) — não havia rota nenhuma pra criar/editar/desativar um código, e a única trava existente (`CODIGO_IMUTAVEL`, `src/lib/escala/codigos.ts`) protegia só `D`.

**Mudanças:**
- Migration `20260101000012_codigo_escala_bloqueado`: nova coluna `bloqueado boolean not null default false`. Os três seeds fixos (`D`, `F`, `FE`) recebem `bloqueado = true`; `FT` fica `false` — deixou de ser especial, agora é só um preset comum (editável/desativável). `FE` também foi renomeado de "Folga TRE" para "Férias" (pedido do usuário) — flags (`presenca`/`ocupaHorario`/`remunerada`) mantidas, só o rótulo mudou.
- **DOM-003.6 revisado** (`specs/01-dominio/codigos-escala.md` atualizada diretamente, não é spec 🔒 hard-locked — só `02-seguranca/*`, `constraints.md`/`triggers.md`, corpo de FN-004/FN-005 e `rls-policies.md` são): "D é imutável" virou "código `bloqueado` (D, F, FE) é imutável". `CODIGO_IMUTAVEL` (`codigos.ts`) foi removido; `podeAlterarFlags`/`podeDesativar` agora recebem `{ bloqueado }` (a fonte de verdade é a coluna do banco, não mais um código hardcoded — consistente com "tabela, não enum").
- Novas rotas: `POST /api/admin/codigos-escala` (criar — sempre `bloqueado: false`, sem esse campo no corpo aceito) e `PATCH`/`DELETE /api/admin/codigos-escala/:id` (editar/desativar — ambas recusam com 409 se `bloqueado`). `GET` ganhou `?todos=true` pra tela de gestão ver também os desativados (uso em seletor continua só ativos, comportamento anterior preservado). Sem spec de API própria (mesmo gap já registrado pra `/api/admin/rts`/`/api/admin/codigos-escala` original).
- `AcaoAuditoria` ganhou `CODIGO_ESCALA_CRIADO`/`CODIGO_ESCALA_ALTERADO`/`CODIGO_ESCALA_DESATIVADO` (extensão aditiva, mesmo padrão já usado no arquivo).
- UI: `<CodigosEscala />` implementada dentro de `/admin/configuracoes`, substituindo o placeholder "esta tela ainda não tem API dedicada" (que agora só sobra pra RT/admins). Código bloqueado aparece com selo "Fixo" e sem botões de ação.
- Padrão de arquivo: as duas rotas usam `_impl.ts` (handlers como fábricas exportadas, testáveis com Prisma fake) + `route.ts` fino (só `GET`/`POST`/`PATCH`/`DELETE`) — exportar as fábricas direto de `route.ts` quebra a checagem de tipos gerada do App Router (`.next/types`), achado ao rodar `tsc --noEmit` depois de tentar isso.

**Pendência técnica**: `npx prisma generate` não rodou nesta sessão — o arquivo `query_engine-windows.dll.node` estava travado (`EPERM`), provavelmente pelo dev server rodando. Migration e schema estão corretos; falta só rodar `prisma generate` (com o dev server parado) e `prisma migrate deploy`/`dev` pra aplicar a migration `012_codigo_escala_bloqueado` antes de usar em ambiente real.

## 40b. Complemento — cor de D/F/FE permanece editável mesmo bloqueado

Pedido do usuário, direto em seguida do item 40: "apesar de D, F e FE serem travados e não opcionais, coloque a configuração das cores deles." `PATCH /api/admin/codigos-escala/:id` (`[id]/_impl.ts`) agora permite que um código `bloqueado` receba um PATCH contendo **só** `cor` — qualquer outro campo junto (mesmo que `cor` também esteja no corpo) continua caindo no 409 de sempre. UI: nova coluna "Cor" na tabela de `<CodigosEscala />`, com `<input type="color">` habilitado pra todo código, inclusive os fixos (a coluna "Ações" continua "—" pra eles).

Também aplicada e verificada nesta sessão: `prisma migrate deploy` rodou a migration `012_codigo_escala_bloqueado` contra o banco real (Supabase) — `prisma migrate dev` não serve aqui porque o shadow database falha ao reaplicar `009_rls` (`publication "supabase_realtime" does not exist`, específico de ambiente Supabase gerenciado; `deploy` não usa shadow db, só aplica migrations pendentes direto). `prisma generate` continua bloqueado (`EPERM` no `query_engine-windows.dll.node`) enquanto o dev server do usuário estiver rodando — pendência que só o usuário resolve (parar o servidor, eu rodo `generate`, ele reinicia).

## 40c. Complemento — cor só vai pro banco ao confirmar (✓), não a cada troca no seletor

Pedido do usuário: "Da forma como você fez vamos sobrecarregar o banco com alterações de cores. Coloque no colorpicker um certinho e só enviará a alteração pro banco de dados depois de clicar no certinho, no ok." O `onChange` do `<input type="color">` disparava um `PATCH` a cada mudança — problemático porque alguns navegadores emitem vários eventos durante o arrasto no seletor nativo.

Corrigido: `onChange` agora só atualiza um estado local (`coresPendentes`, por id de código) — nenhuma chamada de rede. Um botão ✓ aparece ao lado do seletor só quando há cor pendente diferente da salva; clicar nele dispara o único `PATCH` (`confirmarCor`). Um botão ✕ ao lado descarta a pendência sem chamar a API. Mesmo padrão vale pra código bloqueado (D/F/FE) e não-bloqueado — a única coisa que muda por `bloqueado` continua sendo o backend aceitar só `cor` nesse caso (item 40b).

## 40d. Complemento — GET de códigos-escala cacheado pelo navegador escondia a atualização de cor

Usuário relatou: cor de "Disponível" só refletia na tela depois de dar F5; "Folga" e "Férias" pareciam nem aceitar a troca. Causa única pros dois sintomas: `GET /api/admin/codigos-escala` usa `cache: 'referencia'` (`Cache-Control: private, max-age=300` — pensado pra preencher `<select>` sem bater no banco toda hora, ver item 30-ish de referência). A tela de gestão (`<CodigosEscala />`) chama esse mesmo `GET` pra recarregar a lista logo após um `PATCH` — e o navegador respondia do cache HTTP local em vez de ir à rede, então a cor nova só aparecia depois de um reload manual (que ignora esse cache). Pra quem não sabia que precisava dar F5, parecia que a troca simplesmente não tinha funcionado — foi o que aconteceu com "Folga"/"Férias" (provavelmente a troca de "Disponível" TAMBÉM não funcionou de primeira, só que o usuário viu funcionar depois de recarregar por outro motivo).

Corrigido: `get()` (`src/lib/api/client.ts`) ganhou um segundo parâmetro opcional `OpcoesApi` (mesmo padrão que `post`/`patch`/`put` já tinham); `recarregar()` em `<CodigosEscala />` passa `{ cache: 'no-store' }`, forçando bypass do cache HTTP do navegador nessa tela de gestão (o `<select>` de referência usado em outras telas continua se beneficiando do cache de 5min, intocado).

## 41. `POST /api/admin/escala/lote` (ausências em massa) falhava com 500 num intervalo de 15 dias — N+1 de consultas de jornada

Usuário relatou "as ausências em massa não estão funcionando" — lote de 15 dias com código `FE`, 500 depois de ~12.4s. Causa: a revalidação de jornada (`API-ADM-ESC-003`, passo 5, só roda quando o código novo tem `ocupaHorario = true`) chamava `revalidarJornadaDoDia` num `for` sequencial, uma vez por dia do intervalo — cada chamada fazia 2 consultas ao Postgres (`fonteBlocosOcupadosPrisma`). Um lote de 15 dias = 30 round-trips sequenciais contra o Supabase (região remota); tempo suficiente pra estourar algum timeout do lado do banco/pooler, e a exceção bruta caía em `ERRO_INTERNO` (500 genérico).

**Achado colateral, corrigido junto**: um 500 desses não deixava rastro nenhum pra debugar — o log estruturado (`LinhaLog`, `handler.ts`) só grava `status`/`duracaoMs`, nunca a exceção original, e a resposta ao cliente nunca leva stack (por design, `erros.ts`, "nenhuma mensagem contém... stack"). `defineHandler` agora dá `console.error` no servidor (nunca no `LinhaLog` nem na resposta) sempre que a tradução de erro cai em `ERRO_INTERNO` — só assim foi possível confirmar a causa real deste item.

**Correção**: `fonteBlocosOcupadosEmMemoria` (nova, `jornada.ts`) implementa a mesma porta `FonteBlocosOcupados` filtrando em JS um superconjunto já carregado, em vez de consultar o banco por chamada. `escala/lote/route.ts` agora faz UMA consulta de `escala_dia` + UMA de `marcacao` cobrindo toda a janela do lote (o maior `maxBlocosSeguidos` do lote + 1 dia de folga, superconjunto de qualquer janela individual que `calculaJanela` pediria por dia) e usa essa fonte em memória dentro do laço — resultado idêntico ao de consultar dia a dia (mesmo critério de filtro), só sem os round-trips repetidos. Teste novo (`route.test.ts`, #8) prova que a janela de jornada agora é buscada em uma única chamada, não uma por dia.

## 42. Paridade Ímpar/Par da grade quebrava com ausência cobrindo os dias 1 e 2 do ciclo — achado em uso real (férias da Gabriela)

Usuário relatou: marcar férias (código `FE`) pra Gabriela fez ela mudar de seção "Par Noturno" pra "Ímpar Noturno" na grade, mesmo ela sendo realmente Par. Causa: `paridade` (`grade.ts`, item 36) era inferida olhando `presenca` do CÓDIGO dos dias 1 e 2 (`codigoDia1?.presenca ? IMPAR : codigoDia2?.presenca ? PAR : IMPAR`) — uma heurística que só funciona enquanto pelo menos um dos dois dias ainda tem um código de trabalho de verdade. Uma ausência em lote que cobre os dias 1 E 2 (férias, licença) zera `presenca` nos dois — nenhum dos `?.presenca` bate, e o fallback assumia `IMPAR` incondicionalmente (o comentário até dizia "não deveria acontecer em uso normal", mas acontece toda vez que a ausência cobre o início do ciclo).

**Corrigido na raiz**: `paridade` agora vem de `trabalhaEm` (`lib/escala/ancora.ts`, DOM-001) aplicada ao dia 1 do ciclo com a âncora/periodicidade REAIS do colaborador — a mesma função que gera a escala em si, nunca lê o código do dia. `ColaboradorGradeEntrada` ganhou `escalaAncora`/`escalaPeriodo` (selecionados agora em `consulta.ts`); a paridade deixa de ser sensível a qualquer código lançado nos dias 1/2, correta mesmo com o colaborador de férias o mês inteiro. Testes novos em `grade.test.ts` cobrindo o cálculo correto (Ana ímpar/Bruno par via âncora) e reproduzindo exatamente o bug relatado (férias nos dias 1 e 2 não muda a paridade de um colaborador PAR).

## 43. Letra do dia da semana em cima do número — pedido do usuário, igual planilha real

Usuário anexou uma planilha real de escala (RESIDÊNCIA TERAPÊUTICA TIPO II) mostrando a letra do dia da semana (T Q Q S S D S — Terça/Quarta/Quinta/Sexta/Sábado/Domingo/Segunda) numa linha acima do número do dia, e pediu o mesmo na grade do sistema.

Novo helper `letraDiaSemana(ano, mes, dia)` em `src/lib/escala/ancora.ts` — convenção brasileira D/S/T/Q/Q/S/S (Domingo, Segunda, Terça, Quarta, Quinta, Sexta, Sábado; Quarta/Quinta e Sexta/Sábado compartilham letra de propósito, é a abreviação padrão). Puramente apresentacional, sem regra de negócio.

Aplicado em: `<GradeEscala />` (grade ao vivo — `Subgrade` e `TabelaExtras`, cabeçalho de 2 linhas com `rowSpan` nas colunas "Colaborador"/"Totais"), `<EscalaImpressao />` (impressão/A4), e `gerarXlsx` (`export.ts` — cabeçalho de coluna com `\n` + `wrapText`, ex. `"T\n1"`). PDF (`gerarPdf`) não foi alterado — é texto corrido por colaborador, sem cabeçalho de coluna algum (nem o número do dia aparece separado hoje), fora do escopo proporcional deste pedido.

Nota pra quem mexer nos testes de `GradeEscala.test.tsx`/`EscalaImpressao.test.tsx`: o cabeçalho agora tem DUAS linhas (`<tr>`) dentro do mesmo `<thead>` — a linha das letras tem a coluna "Colaborador" (e "Totais", em `<GradeEscala />`) com `rowSpan={2}`, mas a linha dos números não a repete. Testes que indexam `tr.children` pra achar a célula correspondente a um dia precisam somar +1 ao índice encontrado na linha de números antes de aplicar à linha do corpo (que tem "Colaborador" como primeira célula) — ver comentários nos testes atualizados.

## 44. Colunas de dia/colaborador com largura fixa e idêntica em toda tabela — pedido do usuário ("todas as colunas terem o mesmo tamanho")

Cada subgrupo (Ímpar Diurno, Ímpar Noturno, Par Diurno, Par Noturno, Extras Diurno, Extras Noturno) é uma `<table>` HTML independente, empilhada verticalmente. Com `table-layout` automático (padrão), cada tabela ajusta a largura de cada coluna ao PRÓPRIO conteúdo — um nome comprido de colaborador na tabela "Par Noturno" não influencia a largura da coluna "Colaborador" da tabela "Ímpar Diurno" logo acima, e as colunas de dia (1, 2, 3...) acabavam não ficando alinhadas verticalmente entre as tabelas empilhadas, disparidade que piorava na impressão (`<EscalaImpressao />`).

**Corrigido**: todas as tabelas (`<Subgrade />`/`<TabelaExtras />` em `GradeEscala.tsx`; tabela base/`<TabelaExtrasImpressao />` em `EscalaImpressao.tsx`) agora usam `table-layout: fixed` + `<colgroup>` com larguras explícitas.

- `<GradeEscala />` (tela, com scroll horizontal): larguras em PIXELS fixos e idênticos em toda a página — `LARGURA_COL_COLABORADOR_PX=176`, `LARGURA_COL_DIA_PX=32`, `LARGURA_COL_TOTAIS_PX=96` (só na subgrade principal, extras não tem coluna de totais). Nome de colaborador que não couber trunca (`truncate`) em vez de esticar a coluna.
- `<EscalaImpressao />` (impressão, precisa caber exatamente na largura útil da folha A4): larguras em PERCENTUAL — coluna "Colaborador" fixa em 14%, o resto dividido igualmente pelos dias do mês (`larguraColDiaPct`). Percentual em vez de px porque a tabela tem que caber exatamente na largura calculada da folha (`LARGURA_UTIL_PX`); como `diasDoMes.length` é o mesmo em toda tabela de um mesmo print job, o percentual por dia sai idêntico em todas, garantindo alinhamento vertical entre as tabelas empilhadas de uma RT.
- XLSX (`gerarXlsx`) já era uniforme (uma única aba por RT, um `aba.columns` só, sem múltiplas tabelas independentes) — não precisou de mudança.
- PDF (`gerarPdf`) não tem conceito de coluna tabular (texto corrido por colaborador) — fora do escopo, mesma exclusão do item 43.

Testes novos em `GradeEscala.test.tsx`/`EscalaImpressao.test.tsx` comparando a largura do `<col>` entre tabelas diferentes da mesma página/RT (devem ser idênticas, `Set(...).size === 1`), incluindo um caso com nome de colaborador propositalmente muito comprido pra provar que não infla a coluna só na própria tabela.
