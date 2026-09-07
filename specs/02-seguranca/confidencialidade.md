# Confidencialidade

- **ID:** SEC-CONF
- **Status:** PRONTA — **alteração exige revisão humana**
- **Entregáveis:** `src/server/auth/credenciais.ts`, `src/server/log/redact.ts`, políticas RLS

---

## Classificação dos dados

| Nível | Dados | Quem acessa |
|---|---|---|
| **Crítico** | PIN, token de sessão | Ninguém — só hash existe |
| **Restrito** | `tentativa_login`, `audit_log`, sessões | Admin |
| **Interno** | Escala nominal, ausências, marcações | Admin + o próprio colaborador |
| **Público interno** | Plantões, vagas, RTs, códigos | Qualquer autenticado |

A escala nominal é afixada fisicamente na unidade — tratá-la como segredo seria teatro.
Mas **o motivo de uma ausência** não é público: `escala_dia.observacao` é restrito ao admin,
porque costuma conter informação de saúde.

## Credenciais

| Dado | Tratamento |
|---|---|
| PIN | `argon2id` + `PIN_PEPPER`. 4–6 dígitos |
| Token de sessão | 32 bytes aleatórios; **só o SHA-256 vai ao banco** |

Parâmetros do argon2id: `m=19456, t=2, p=1` (OWASP 2024). Pepper em variável de ambiente,
fora do banco — vazamento de dump sozinho não permite ataque de dicionário.

> **Por que PIN.** A matrícula circula em folha de ponto, crachá e planilha de RH.
> É um identificador, não um segredo. Sem um segundo fator, qualquer colega marca plantão no
> lugar de outro — e o `audit_log` registraria a vítima como autora. O PIN é o que torna a
> auditoria significativa.

## Least privilege no banco

Três roles, nenhum deles superusuário:

| Role | Permissões |
|---|---|
| `app_server` | `SELECT/INSERT/UPDATE` nas tabelas de negócio. **Sem `DELETE`** salvo `sessao_colaborador`. Sem `TRUNCATE`, sem DDL. |
| `app_readonly` | `SELECT` para relatórios e BI |
| `anon` | `SELECT` em `plantao` restrito a ciclo publicado, colunas não-pessoais |

```sql
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_server;
REVOKE UPDATE, DELETE ON audit_log FROM app_server;   -- append-only
REVOKE DELETE ON marcacao, escala_dia FROM app_server; -- cancelamento é UPDATE
```

Cancelar marcação é `UPDATE status = 'CANCELADA'`, jamais `DELETE`. O histórico é o produto.

## RLS

Todas as tabelas com `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`, sem exceção,
com default deny. Detalhe em `02-seguranca/rls-policies.md`.

A `anon key` chega ao navegador — presuma que está pública. Ela só serve para Realtime de
leitura em `plantao`. `marcacao`, `escala_dia`, `colaborador` e `audit_log` **não** entram na
publication de Realtime; o que o cliente precisa saber viaja por Broadcast, com payload já
filtrado no servidor.

## Transporte e sessão

- TLS 1.2+ obrigatório; HSTS com `max-age=63072000; includeSubDomains; preload`
- Cookie: `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sem `Domain` amplo
- CSP sem `unsafe-inline`; nonce por request, gerado em `src/middleware.ts` (Web Crypto,
  compatível com o runtime Edge)
  - O nonce e o header `Content-Security-Policy` são setados tanto nos headers de
    **requisição** repassados via `NextResponse.next({ request: { headers } })` quanto nos de
    **resposta** — o Next.js só aplica o nonce aos próprios `<script>` que injeta (payload de
    hidratação, streaming de RSC) se enxergar a CSP também no request; presente só na resposta
    não é suficiente
  - `script-src` inclui `'strict-dynamic'` além do nonce — receita oficial do Next.js para CSP
    com nonce em App Router: propaga a confiança do script raiz (com nonce) para os `<script>`
    que o próprio framework injeta dinamicamente em runtime, cada um com hash diferente. `'self'`
    continua listado como fallback para navegadores sem suporte a CSP Level 2
  - O layout raiz (`src/app/layout.tsx`) é `async` e chama `await headers()` só para forçar
    renderização dinâmica de toda a árvore — sem isso, qualquer rota sem API dinâmica própria é
    pré-renderizada em build time com um nonce fixo no HTML que nunca bate com o nonce (gerado
    por requisição) da CSP corrente, e o script é bloqueado
  - **Cuidado ao montar `headers` em `NextResponse.next({ request: { headers } })`:** esse
    `request.headers` **substitui** inteiramente o conjunto repassado adiante no pipeline, não
    faz merge. `src/middleware.ts` clona `request.headers` recebido (`new Headers(request.headers)`)
    e só adiciona `x-csp-nonce` a ele — nunca cria um `Headers` novo do zero, ou todo header do
    cliente (`Cookie`, `X-Requested-With`) some das rotas depois do middleware
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`

## Dado pessoal nunca em

- **URL ou query string** — aparecem em log de proxy, histórico e `Referer`.
  PIN só em body de `POST`. Busca de colaborador por matrícula usa `POST /buscar`, não `GET ?matricula=`.
- **Log** — redator central obrigatório. Chaves bloqueadas: `pin`, `token`, `cookie`,
  `authorization`, `tokenHash`, `senha`.
- **Mensagem de erro** — `CREDENCIAIS_INVALIDAS` nunca diz qual campo falhou.
- **Analytics ou telemetria de terceiros.**

## Enumeração

Login responde igual para matrícula inexistente e PIN errado, com tempo constante: a
verificação de hash roda mesmo quando o colaborador não existe, contra um hash dummy fixo.
Sem isso, a diferença de latência entrega quais matrículas existem.

## Retenção e expurgo

| Dado | Retenção | Depois |
|---|---|---|
| `tentativa_login` | 90 dias | apagado |
| `sessao_colaborador` expirada | 30 dias | apagado |
| `audit_log` | 5 anos | anonimizado (`ator_id` → hash) |
| `escala_dia`, `marcacao` | 5 anos | arquivado |
| Colaborador desligado | 5 anos após desligamento | PIN hash apagado, nome pseudonimizado |

Job diário de expurgo, com contagem registrada em log. Erro no expurgo é alerta, não silêncio.

## Dados em ambientes não-produtivos

**Dump de produção nunca vai para dev ou staging.** O seed de dev gera dados sintéticos com
matrículas fictícias inexistentes em produção. Se um caso exigir dado real,
passa por anonimização irreversível documentada — e a exceção é registrada.

## LGPD

- Base legal: execução de contrato de trabalho (art. 7º, V) e obrigação legal (art. 7º, II).
- Titular pode solicitar acesso e correção; a rota de exportação está em `API-ADM-COL-009`.
- Direito ao esquecimento é **limitado** pela obrigação de guarda trabalhista (5 anos após
  desligamento). A resposta ao titular deve declarar isso explicitamente, não negar sem motivo.
- Registro de operações de tratamento mantido em `08-operacao/`.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| C1 | Grep de PIN em claro no banco | zero ocorrências |
| C2 | Suíte completa + varredura de log por chaves bloqueadas | zero ocorrências |
| C3 | `anon key` tentando `SELECT` em `marcacao` | negado por RLS |
| C4 | Colaborador A lendo escala de B via API | `404` |
| C5 | Login com matrícula inexistente vs PIN errado | resposta e tempo indistinguíveis (±20ms) |
| C6 | `app_server` tentando `DELETE FROM audit_log` | negado |
| C7 | PIN em query string em qualquer rota | falha de lint (regra customizada) |
| C8 | Headers de segurança em produção | todos presentes |
