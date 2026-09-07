# API-COL-009 — `GET /api/ciclos/vizinhos?ano=&mes=`

- **ID:** API-COL-009
- **Status:** PRONTA
- **Ator:** Colaborador
- **Pré-requisitos:** `API-COL-001`
- **Entregáveis:** `src/app/api/ciclos/vizinhos/route.ts`,
  `src/server/services/colaborador/ciclos-vizinhos.ts`, `src/hooks/useNavegacaoCiclos.ts`

## Objetivo

Sustenta a navegação de mês por chevrons em `/plantoes-calendario` e
`/minha-escala-calendario` (pedido do usuário). Dado um `(ano, mes)` de referência, devolve
o ciclo `PUBLICADO` daquele mês (se houver) e os `PUBLICADO` mais próximos antes/depois —
`RASCUNHO` e `FECHADO` nunca aparecem como vizinhos, como se não existissem. Nas palavras do
usuário: "ciclo fechado é ciclo cancelado, não serve pra nada".

## Contrato

### Query
`ano` (obrigatório) · `mes` (obrigatório, 1-12)

### Response 200
```ts
{
  anterior: CicloResumo | null,
  atual: CicloResumo | null,
  proximo: CicloResumo | null,
  servidorEm: string,
}

type CicloResumo = {
  id, ano, mes,
  janela: { abertura: string | null, fechamento: string | null, estado: 'ANTES' | 'ABERTA' | 'ENCERRADA' },
  permiteCruzada: boolean,
}
```
`atual` é `null` quando o mês pedido não tem ciclo `PUBLICADO` — isso não impede navegar:
`anterior`/`proximo` continuam resolvidos normalmente. `anterior`/`proximo` são sempre o
`PUBLICADO` mais próximo em cada direção, pulando qualquer mês sem ciclo ou com ciclo
`RASCUNHO`/`FECHADO`.

## Autorização

Colaborador autenticado. Mesma política de cache de `API-COL-001` (`private, max-age=5`).

## Fluxo

1. Buscar todos os ciclos `PUBLICADO` (tabela pequena — um por mês tipicamente; resolvido em
   memória, sem paginar, mesmo espírito de `codigo_escala`)
2. Ordenar por `(ano, mes)` e localizar `atual` (chave exata), `anterior` (o último antes do
   alvo) e `proximo` (o primeiro depois)
3. Calcular `estado` da janela de cada um contra `ctx.agora`, igual `API-COL-001`

## ACID

Leitura simples, sem efeito colateral.

## CIA

**C:** não expõe ciclos `RASCUNHO`/`FECHADO` — mesmo colaborador de outra RT não vê rascunho
em construção.
**I:** `estado` da janela sempre derivado no servidor contra `ctx.agora`, nunca no cliente
(mesmo motivo de `API-COL-001` — relógio do cliente não é confiável).
**D:** `private, max-age=5` — mesma política de `/api/ciclos/atual`; uma chamada por passo de
navegação (o hook já usa o vizinho em cache do passo anterior para trocar a tela na hora,
essa chamada só confirma e busca +1 adiante).

## Notas de implementação

`useNavegacaoCiclos` (`src/hooks/useNavegacaoCiclos.ts`, compartilhado pelas duas páginas)
mantém uma janela de 3 ciclos em memória. Ao navegar, o vizinho já conhecido vira o novo
`atual` imediatamente — sem esperar rede, para nunca mostrar tela de carregando ao trocar de
mês — e só então este endpoint é chamado de novo, centrado no novo `atual`, para descobrir
mais um passo adiante. O hook resolve só **qual** ciclo mostrar; cada página cacheia os
DADOS daquele ciclo (`/api/plantoes` em `_CalendarioPlantoesClient.tsx`,
`/api/minha-escala` + `/api/minhas-marcacoes` em `_CalendarioEscalaClient.tsx`) por
`cicloId`, e pré-busca os dados dos vizinhos assim que a navegação os revela.

`<GoogleCalendarBotao />` permanece atrelado ao ciclo do carregamento inicial (SSR) e não
acompanha a navegação client-side — decisão deliberada, fora do escopo deste pedido.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Mês com ciclo `PUBLICADO` | `atual` preenchido |
| 2 | Mês sem ciclo `PUBLICADO` | `atual = null`, `anterior`/`proximo` ainda resolvidos |
| 3 | Vizinho `RASCUNHO`/`FECHADO` | pulado, próximo `PUBLICADO` retornado no lugar |
| 4 | Nenhum ciclo `PUBLICADO` antes | `anterior = null` |
| 5 | Nenhum ciclo `PUBLICADO` depois | `proximo = null` |
| 6 | `estado` da janela | igual à conta de `API-COL-001` para o mesmo ciclo |
