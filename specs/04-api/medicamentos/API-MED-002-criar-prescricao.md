# API-MED-002 — `POST /api/pacientes/:pacienteId/prescricoes`

- **ID:** API-MED-002
- **Status:** RASCUNHO
- **Ator:** Colaborador (admin também pode, para correção/cobertura administrativa)
- **Pré-requisitos:** `01-dominio/regras-negocio-pacientes.md` (`RNP-13`, `RNP-16`, `RNP-24`), `SEC-SAUDE`
- **Entregáveis:** `src/app/api/pacientes/[pacienteId]/prescricoes/route.ts`

## Objetivo

Registra a receita — temporária ou definitiva (`RNP-24`) — recebida pelo colaborador de plantão.
Se `tipo = REGULAR`, gera de imediato as administrações `PENDENTE` previstas para toda a
vigência (`RNP-16`) — sem isso a tela de MAR e os alertas (`FN-014`) não têm o que mostrar.

## Contrato

### Request
```ts
{ medicamentoId, tipo: 'REGULAR' | 'PRN', duracao: 'DEFINITIVA' | 'TEMPORARIA',
  dose, via, horarios?: string[],      // obrigatório se REGULAR, formato HH:MM
  dataInicio: string,
  dataFim?: string,                    // obrigatório se TEMPORARIA; rejeitado se DEFINITIVA
  prescritoPor: string, instrucoes?: string }
```

### Response 201
Prescrição criada.

### Erros
`MEDICAMENTO_INEXISTENTE` 422 · `HORARIOS_OBRIGATORIOS` 422 (`REGULAR` sem `horarios`) ·
`VIGENCIA_INCONSISTENTE` 422 (`TEMPORARIA` sem `dataFim`, ou `DEFINITIVA` com `dataFim`) ·
`VIGENCIA_MUITO_LONGA` 422 (teto de 1 ano de geração de doses mesmo para `DEFINITIVA` — renovar a
geração é responsabilidade de um job periódico, não deste endpoint; ver nota abaixo)

## Fluxo

1. Validar `medicamentoId` existe e está `ativo`
2. Validar `duracao`/`dataFim` (`RNP-24`) — a checagem de aplicação replica `chk_prescricao_duracao`
   (`DB-007`) para dar erro `422` amigável antes de chegar no banco
3. Inserir `prescricao` com `origem` = `COLABORADOR` ou `ADMIN` conforme o ator da sessão
4. Se `REGULAR`: para cada dia entre `dataInicio` e `dataFim` (ou +1 ano se `DEFINITIVA`,
   truncado no teto — job periódico estende a geração enquanto a prescrição seguir `ATIVA`,
   fora do escopo desta rota), para cada horário em `horarios`, inserir
   `administracao_medicamento` `PENDENTE` com `horario_previsto` combinando data+hora — **na
   mesma transação** do insert da prescrição
5. Auditar `PRESCRICAO_CRIADA` sem `instrucoes` no payload (`SEC-SAUDE`)

## ACID

**A:** prescrição + N administrações `PENDENTE` são uma única transação — nunca existe
prescrição sem suas doses previstas geradas.

## CIA

**C:** `instrucoes` é campo restrito (`SEC-SAUDE`) — nunca ecoado em log; response ao próprio
colaborador/admin autenticado pode conter, mas não em log estruturado da requisição.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Colaborador cria `REGULAR` + `TEMPORARIA`, 3 horários, 7 dias | 21 administrações `PENDENTE` |
| 2 | `PRN` | zero administrações geradas |
| 3 | `REGULAR` sem `horarios` | 422 |
| 4 | `TEMPORARIA` sem `dataFim` | 422 `VIGENCIA_INCONSISTENTE` |
| 5 | `DEFINITIVA` com `dataFim` | 422 `VIGENCIA_INCONSISTENTE` |
| 6 | `medicamentoId` inativo | 422 |
| 7 | `instrucoes` em log estruturado da rota | ausente |
