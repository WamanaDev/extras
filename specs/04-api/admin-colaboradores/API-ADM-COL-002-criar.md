# API-ADM-COL-002 — `POST /api/admin/colaboradores`

- **ID:** API-ADM-COL-002
- **Status:** PRONTA — **alteração exige revisão humana**
- **Ator:** Admin
- **Pré-requisitos:** `01-dominio/escala-12x36.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/colaboradores/route.ts`

## Objetivo

Cadastra colaborador com lotação e escala base. O turno padrão e a âncora são obrigatórios — sem eles a pessoa não entra em nenhuma escala.

## Contrato

### Request
```ts
{ matricula, nome, rtId, turnoPadrao: 'DIURNO' | 'NOTURNO',
  escalaAncora: string, escalaPeriodo?: number,
  escalaHoraInicio?: string, escalaHoraFim?: string }
```

### Response 201
Colaborador criado, **sem** dados de credencial.

### Erros
`MATRICULA_JA_EXISTE` 409 · `ANCORA_INVALIDA` 422

## Fluxo

1. Validar matrícula e âncora
2. Inserir com `precisaTrocarPin = true` e `pinHash = NULL`
3. Auditar `COLABORADOR_CRIADO` **sem** dados de credencial no payload
5. Retornar preview de 3 meses de escala para conferência do admin

## ACID

**C:** `colaborador_matricula` único impede duplicata concorrente; `23505` → 409. Insert + auditoria numa transação.

## CIA

**C:** apenas a matrícula identifica o colaborador; nenhum dado de credencial é
recebido ou devolvido nesta rota — o PIN é definido pelo próprio colaborador no primeiro acesso.
**I:** a âncora define toda a escala futura da pessoa. O preview de 3 meses no response é o
que permite ao admin conferir *antes* de gerar a escala do mês: se a âncora estiver um dia
errada, todos os plantões da pessoa saem invertidos.
**D:** PIN não é definido aqui — a pessoa define no primeiro acesso.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Cadastro válido | 201 + preview |
| 2 | Matrícula duplicada | 409 |
| 3 | Sem âncora | 422 |
| 4 | Dados de credencial no `audit_log` | ausente |
| 5 | Preview | bate com `FN-002` |
