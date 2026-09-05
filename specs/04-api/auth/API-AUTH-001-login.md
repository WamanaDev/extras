# API-AUTH-001 — `POST /api/auth/colaborador/login`

- **ID:** API-AUTH-001
- **Status:** PRONTA — **alteração exige revisão humana**
- **Ator:** Público
- **Pré-requisitos:** `02-seguranca/confidencialidade.md`, `02-seguranca/disponibilidade.md`
- **Entregáveis:** `src/app/api/auth/colaborador/login/route.ts`, `src/server/auth/credenciais.ts`

## Objetivo

Primeira etapa do login. Valida a matrícula e devolve um token parcial de
curta duração que habilita a etapa do PIN. **Não cria sessão.**

Separar em duas etapas evita que a validação do PIN aconteça no mesmo request em que
descobrimos se a matrícula existe — o que facilitaria enumeração por diferença de latência.

## Contrato

### Request
```ts
{ matricula: string }
```

### Response 200
```ts
{ tokenParcial: string, precisaDefinirPin: boolean, expiraEm: string }
```

`tokenParcial`: JWT de 3 minutos, uso único, assinado, com `sub` do colaborador e escopo
`pin-pendente`. Não serve para nada além da etapa 2.

### Erros
| Erro | HTTP | Quando |
|---|---|---|
| `CREDENCIAIS_INVALIDAS` | 401 | matrícula inexistente |
| `CONTA_BLOQUEADA` | 423 | `bloqueadoAte > now()` |
| `COLABORADOR_INATIVO` | 403 | desligado |
| `MUITAS_TENTATIVAS` | 429 | rate limit de IP |

## Autorização

Pública. Rate limit é a única barreira — ver `SEC-DISP`.

## Fluxo

1. Rate limit por IP (20/15min) e por matrícula (5 falhas/15min)
2. Buscar colaborador por matrícula
3. **Se não existir, seguir o mesmo caminho de tempo constante** — não retornar mais cedo
4. Registrar em `tentativa_login` (sempre, sucesso ou falha)
5. Falha → incrementar `tentativasFalhas`; ao atingir 5, gravar `bloqueadoAte`
6. Sucesso → zerar contador, emitir `tokenParcial`

## ACID

Passos 4–6 na mesma transação: contador incrementado sem registro de tentativa
tornaria o bloqueio inauditável. `$transaction` com callback.

## CIA

**C:** resposta idêntica e de tempo constante para matrícula inexistente ou existente
(`SEC-CONF`). Matrícula só em body `POST`, nunca em log ou URL.
**I:** `tokenParcial` assinado, uso único, escopo restrito — não é sessão.
**D:** bloqueio temporário (15 min), nunca permanente automático — senão vira DoS contra
colegas (`SEC-STRIDE`, D2).

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Matrícula válida | 200 + `tokenParcial` |
| 2 | Matrícula inexistente | resposta e tempo indistinguíveis (±20 ms) |
| 3 | 5 falhas | 6ª retorna `CONTA_BLOQUEADA` |
| 4 | Bloqueio após 15 min | libera sozinho |
| 5 | `tokenParcial` usado 2× | segunda falha |
| 6 | `tokenParcial` expirado | falha |
| 7 | Colaborador inativo | `COLABORADOR_INATIVO` |
