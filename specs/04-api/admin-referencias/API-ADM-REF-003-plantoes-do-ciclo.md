# API-ADM-REF-003 — `GET /api/admin/ciclos/:id/plantoes`

- **ID:** API-ADM-REF-003
- **Status:** PRONTA
- **Ator:** Admin
- **Entregáveis:** `src/app/api/admin/ciclos/[id]/plantoes/route.ts`

## Objetivo

Lista de plantões ativos de um ciclo, para alimentar `<select>` nas telas que editam/removem
um plantão existente ou marcam/cancelam extra como admin — `admin-plantoes`/`admin-marcacoes`
só definem `POST`/`PATCH`/`DELETE` por id, nenhuma cobre "listar plantões do ciclo" (mesma
família de gap de `API-ADM-REF-001`/`002`).

## Contrato

### Params
`id`: uuid do ciclo.

### Response 200
```ts
{ itens: Array<{
  id: string, data: string, tipo: 'DIURNO' | 'NOTURNO',
  rtId: string, rtNome: string,
  vagasTotais: number, vagasOcupadas: number,
}> }
```
Só plantões `ativo: true`. Ordenado por `data`, depois `horaInicio`.

## Cache

`cache: 'pessoal'` — muda com frequência (vagas ocupadas) e é específico do ciclo, não vale
a pena compartilhar entre requisições como `referencia`.

## Autorização

Admin autenticado.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Ciclo com plantões | lista ordenada por data/hora |
| 2 | Plantão removido (`ativo: false`) | não aparece |
| 3 | Ciclo sem plantões | array vazio |
