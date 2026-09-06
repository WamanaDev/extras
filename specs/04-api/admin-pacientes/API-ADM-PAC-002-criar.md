# API-ADM-PAC-002 — `POST /api/admin/pacientes`

- **ID:** API-ADM-PAC-002
- **Status:** RASCUNHO
- **Ator:** Admin
- **Pré-requisitos:** `01-dominio/pacientes-modelo.md`, `SEC-SAUDE`
- **Entregáveis:** `src/app/api/admin/pacientes/route.ts`

## Objetivo

Cadastra paciente lotado em uma RT (`RNP-02`).

## Contrato

### Request
```ts
{ nome, dataNascimento: string, rtId, cpf?: string,
  nomeResponsavel?: string, contatoResponsavel?: string, observacoesClinicas?: string }
```

### Response 201
Paciente criado.

### Erros
`RT_INVALIDA` 422 · `CPF_JA_CADASTRADO` 409 (se `cpf` informado e único)

## Fluxo

1. Validar `rtId` existe e está ativa
2. Inserir com `status = ATIVO`, `criadoPorId` = admin da sessão
3. Auditar `PACIENTE_CRIADO` **sem** `observacoesClinicas` no payload de auditoria (`SEC-SAUDE`)

## ACID

**A/D:** insert + auditoria na mesma transação.

## CIA

**C:** `observacoesClinicas` é campo restrito (`SEC-SAUDE`) — nunca ecoado em log; response ao
próprio admin autenticado pode conter, mas não em log estruturado da requisição.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Cadastro válido | 201 |
| 2 | `rtId` inexistente | 422 |
| 3 | `observacoesClinicas` no `audit_log` | ausente |
| 4 | `observacoesClinicas` em log estruturado da rota | ausente |
