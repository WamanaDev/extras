# API-PAC-001 — `GET /api/pacientes`

- **ID:** API-PAC-001
- **Status:** RASCUNHO
- **Ator:** Colaborador
- **Pré-requisitos:** `04-api/contrato-comum.md`, `RNP-01`
- **Entregáveis:** `src/app/api/pacientes/route.ts`

## Objetivo

Lista pacientes **ativos da própria RT** do colaborador autenticado — nunca aceita `rtId` do
cliente (`API-000` "Ator", `RNP-01`).

## Contrato

### Response 200
```ts
{ itens: Array<{ id, nome, status }> }
```

Sem `dataNascimento`, `cpf`, `observacoesClinicas` — só o necessário para escolher o paciente na
tela de agendamento/medicação. Detalhe completo em `API-PAC-002`.

## Fluxo

1. `rtId` = `ator.colaborador.rtId` da sessão
2. `SELECT * FROM paciente WHERE rt_id = :rtId AND status = 'ATIVO' ORDER BY nome`

## CIA

**C:** ausência de `rtId` no request é a própria garantia de `RNP-01` — não há campo para o
cliente tentar forjar.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Colaborador da RT1 | só pacientes da RT1 |
| 2 | Paciente `INATIVO` | não aparece |
| 3 | Request tentando passar `?rtId=` de outra unidade | ignorado, usa a do ator |
