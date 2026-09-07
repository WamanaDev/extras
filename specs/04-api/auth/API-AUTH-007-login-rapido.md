# API-AUTH-007 — `POST /api/auth/colaborador/login-rapido`

- **ID:** API-AUTH-007
- **Status:** PRONTA
- **Ator:** Público
- **Pré-requisitos:** `API-AUTH-001`, `API-AUTH-002`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/auth/colaborador/login-rapido/route.ts`, `src/server/auth/login-rapido.ts`

## Objetivo

Login recorrente do colaborador em uma única etapa (matrícula + PIN), sem o `tokenParcial`
intermediário de `API-AUTH-001`/`API-AUTH-002`. Decisão do usuário (redução de fricção no
dia a dia), aprovada em conversa após o trade-off de segurança explicado: matrícula+PIN
sozinhos ficam mais expostos a força bruta que o fluxo em duas etapas, mitigado pelo mesmo
rate limit de 5 falhas/15min.

Este endpoint **não substitui** `API-AUTH-001`/`API-AUTH-002` (ambas `PRONTA — alteração
exige revisão humana`, preservadas intactas) — é aditivo. Na prática, virou o caminho
principal: `/login` usa este endpoint; o fluxo de duas etapas com CPF/matrícula
(`API-AUTH-001`) ficou em `/login/cpf`, reservado para primeiro acesso ou recuperação de PIN.

## Contrato

### Request
```ts
{ matricula: string, pin: string }   // pin: 4 a 6 dígitos
```

### Response 200
```ts
{
  colaborador: { id: string, nome: string, matricula: string, rt: { codigo: string, nome: string } },
  expiraEm: string,
}
```

Define o cookie `sessao_colaborador` (httpOnly, `Secure` só em produção, `SameSite=Lax`,
8h) — mesma sessão de `API-AUTH-002`.

### Erros
| Erro | HTTP | Quando |
|---|---|---|
| `CREDENCIAIS_INVALIDAS` | 401 | matrícula inexistente, colaborador sem PIN definido, ou PIN incorreto |
| `CONTA_BLOQUEADA` | 423 | `bloqueadoAte > now()` |
| `COLABORADOR_INATIVO` | 403 | desligado |
| `MUITAS_TENTATIVAS` | 429 | rate limit de IP ou de matrícula |

## Autorização

Pública. Rate limit por IP (`login_ip`, via `defineHandler`) e por matrícula (`login_matricula`,
5 falhas/15min) — mesmos limites de `API-AUTH-001`.

## Fluxo

1. Rate limit por IP e por matrícula.
2. Buscar colaborador por matrícula.
3. **Anti-enumeração**: matrícula inexistente E colaborador sem PIN definido caem no mesmo
   caminho (comparação contra hash dummy + erro genérico `CREDENCIAIS_INVALIDAS`) — nenhuma
   resposta distingue "não existe" de "existe mas nunca definiu PIN".
4. Colaborador inativo → `COLABORADOR_INATIVO`. Bloqueado → `CONTA_BLOQUEADA`.
5. Verificar PIN. Na mesma transação: registrar `tentativa_login` + `audit_log`
   (`LOGIN_SUCESSO`/`LOGIN_FALHA`, payload `{ etapa: 'login-rapido' }`).
6. Sucesso → zera `tentativasFalhas`, cria sessão, seta cookie.
7. Falha → incrementa `tentativasFalhas`; ao atingir 5, grava `bloqueadoAte`.

## ACID

Passos 5–7 na mesma transação (`emTransacao`) — mesmo padrão de `API-AUTH-002`.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Matrícula + PIN corretos | 200, cookie de sessão, `LOGIN_SUCESSO` auditado |
| 2 | Matrícula inexistente | `CREDENCIAIS_INVALIDAS`, indistinguível do caso 3 |
| 3 | Matrícula existe, sem PIN definido | `CREDENCIAIS_INVALIDAS`, indistinguível do caso 2 |
| 4 | PIN incorreto | `CREDENCIAIS_INVALIDAS`, `tentativasFalhas` incrementado |
| 5 | 5ª falha | 6ª tentativa retorna `CONTA_BLOQUEADA` |
| 6 | Colaborador inativo | `COLABORADOR_INATIVO` |
