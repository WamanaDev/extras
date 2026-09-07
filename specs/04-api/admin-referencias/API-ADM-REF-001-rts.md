# API-ADM-REF-001 — `GET /api/admin/rts`

- **ID:** API-ADM-REF-001
- **Status:** PRONTA
- **Ator:** Admin
- **Entregáveis:** `src/app/api/admin/rts/route.ts`

## Objetivo

Lista de RTs (Residências Terapêuticas) para alimentar `<select>` nas telas admin — nenhuma
tela deve mais pedir UUID de RT digitado à mão (ver `_conflitos.md`, itens de referência).
`contrato-comum.md` já anunciava "Referência (RTs, códigos)" na tabela de cache antes de
qualquer rota existir; esta é a primeira das duas.

## Contrato

### Response 200
```ts
{ itens: Array<{ id: string, nome: string }> }
```

Sem paginação — número de RTs é pequeno o bastante para carregar tudo de uma vez.

## Cache

`Cache-Control: private, max-age=300` (`cache: 'referencia'` em `defineHandler`) — lista muda
raramente, não há rota de CRUD de RT ainda.

## Autorização

Admin autenticado.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Listar | array de `{id, nome}`, ordenado por nome |
| 2 | Sem sessão de admin | 401 |
