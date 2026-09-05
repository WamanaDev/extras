# API-COL-003 — `GET /api/plantoes?cicloId=`

- **ID:** API-COL-003
- **Status:** PRONTA
- **Ator:** Colaborador
- **Pré-requisitos:** `FN-007`
- **Entregáveis:** `src/app/api/plantoes/route.ts`

## Objetivo

Grade de extras já avaliada para o ator: quais estão disponíveis e, quando não
estão, por quê. Alimenta a tela principal do colaborador.

## Contrato

### Response 200
```ts
{
  saldo: { limite, usadas, restantes, permiteCruzada },
  plantoes: Array<{
    id, data, tipo, rt, horaInicio, horaFim,
    vagasTotais, vagasOcupadas,
    jaMarcado: boolean, disponivel: boolean,
    motivo: null | 'JA_MARCADO' | 'CRUZADA_BLOQUEADA' | 'EM_AUSENCIA'
          | 'CONFLITO_DE_HORARIO' | 'EXCEDE_JORNADA' | 'LIMITE_ATINGIDO' | 'SEM_VAGA'
  }>
}
```

## Autorização

Colaborador autenticado. Ator da sessão.

## Fluxo

1. Validar ciclo publicado
2. `FN-008` para o saldo
3. `FN-007` para a grade
4. Devolver tudo numa resposta

## ACID

Ambas as funções são `STABLE` e rodam na mesma transação de leitura — saldo e grade
não podem refletir instantes diferentes.

## CIA

**C:** não retorna quem marcou cada plantão. O colaborador vê vagas, não nomes.
**I:** os `motivo` vêm de `FN-007`, na mesma ordem de `FN-005`. Divergência entre o que a UI
mostra e o que a marcação recusa é bug de confiança (`FN-007`).
**D:** `private, max-age=5`; a vaga exata chega por Realtime. Essa é a rota mais chamada no
pico — cache curto é o que segura o thundering herd (`SEC-DISP`).

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Sem restrição | todos disponíveis |
| 2 | No limite | todos `LIMITE_ATINGIDO` |
| 3 | Outra RT, cruzada off | `CRUZADA_BLOQUEADA`, mas visível |
| 4 | Mesmo turno da base | `CONFLITO_DE_HORARIO` |
| 5 | Formaria 36h | `EXCEDE_JORNADA` |
| 6 | Ciclo em rascunho | 404 |
| 7 | Nome de terceiro no payload | ausente |
| 8 | 50 plantões | p95 < 400 ms |
