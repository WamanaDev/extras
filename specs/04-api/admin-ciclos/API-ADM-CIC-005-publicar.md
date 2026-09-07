# API-ADM-CIC-005 — `POST /api/admin/ciclos/:id/publicar`

- **ID:** API-ADM-CIC-005
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/integridade.md`
- **Entregáveis:** `src/app/api/admin/ciclos/[id]/publicar/route.ts`, `src/server/ciclos/publicar.ts`, `src/server/notificacoes/criar.ts`

## Objetivo

RASCUNHO → PUBLICADO. Torna os plantões visíveis aos colaboradores.

## Contrato

### Request
```ts
{ ignorarAvisos?: boolean }
```

### Response 200
```ts
{ ciclo, avisos: Array<{ tipo, detalhe }> }
```

### Erros
`ESCALA_NAO_GERADA` 409 · `SEM_PLANTOES` 409 · `AVISOS_NAO_CONFIRMADOS` 409 · `TRANSICAO_INVALIDA` 409

## Fluxo

1. Exigir `escalaGeradaEm` preenchido e ao menos um plantão ativo
2. Levantar avisos: dias com déficit de cobertura (`FN-009`), colaboradores sem escala,
   janela no passado
3. Avisos + `ignorarAvisos !== true` → 409 com a lista
4. `UPDATE status = 'PUBLICADO'`, auditar `CICLO_PUBLICADO`
5. Broadcast `ciclo:atualizado`
6. **Após o commit da transação**: notificar (`criarNotificacao`, tipo `CICLO_PUBLICADO`) **todos** os
   colaboradores com `ativo = true` — não só quem tem escala gerada no ciclo. Mensagem
   `"A escala de <Mês>/<Ano> foi publicada."`, link `/minha-escala`

O passo 6 roda fora da transação de publicação, em `try/catch` próprio: falha ao notificar
(um `notificacao.create` individual, por exemplo) nunca desfaz nem reporta erro de uma
publicação que já foi commitada — só loga via `redigirParaLog`. Se o passo 6 estivesse
dentro do `try` da transação ou sem seu próprio catch, uma falha aqui faria a chamada
inteira rejeitar depois que o ciclo já estava publicado de verdade.

## ACID

**A:** transição + auditoria numa transação.
**I:** `FOR UPDATE` no ciclo; transição só de `RASCUNHO`. Duas publicações concorrentes:
a segunda vê `PUBLICADO` e recebe `TRANSICAO_INVALIDA`.

## CIA

**I:** publicar é irreversível na prática — colaboradores já terão visto e marcado.
Por isso a checagem de pré-condições é dura e os avisos exigem confirmação explícita.
**D:** publicar com a janela já aberta dispara o pico imediatamente; o aviso alerta para
publicar antes e deixar a janela abrir sozinha.
**D:** a notificação em massa (passo 6) é best-effort — nunca compromete a disponibilidade
da resposta de publicação, que já refletiu o commit bem-sucedido antes de disparar os envios.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Publicação válida | `PUBLICADO` |
| 2 | Sem escala gerada | `ESCALA_NAO_GERADA` |
| 3 | Sem plantões | `SEM_PLANTOES` |
| 4 | Com déficit de cobertura | `AVISOS_NAO_CONFIRMADOS` |
| 5 | Com `ignorarAvisos` | publica |
| 6 | Já publicado | `TRANSICAO_INVALIDA` |
| 7 | Duas publicações concorrentes | uma só |
| 8 | Publicação bem-sucedida | todo colaborador `ativo = true` recebe notificação `CICLO_PUBLICADO`, mesmo sem escala no ciclo |
| 9 | Colaborador inativo | não recebe notificação |
| 10 | Falha ao criar notificação de um colaborador | publicação permanece efetivada (`200`), erro só logado |
