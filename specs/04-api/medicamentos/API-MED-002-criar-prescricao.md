# API-MED-002 — `POST /api/pacientes/:pacienteId/prescricoes`

- **ID:** API-MED-002
- **Status:** RASCUNHO
- **Ator:** Admin
- **Pré-requisitos:** `01-dominio/regras-negocio-pacientes.md` (`RNP-13`, `RNP-16`), `SEC-SAUDE`
- **Entregáveis:** `src/app/api/pacientes/[pacienteId]/prescricoes/route.ts`

## Objetivo

Cria prescrição (`RNP-13`: só admin). Se `tipo = REGULAR`, gera de imediato as administrações
`PENDENTE` previstas para toda a vigência (`RNP-16`) — sem isso a tela de MAR e os alertas
(`FN-014`) não têm o que mostrar.

## Contrato

### Request
```ts
{ medicamentoId, tipo: 'REGULAR' | 'PRN', dose, via,
  horarios?: string[],           // obrigatório se REGULAR, formato HH:MM
  dataInicio: string, dataFim?: string, prescritoPor: string, instrucoes?: string }
```

### Response 201
Prescrição criada.

### Erros
`MEDICAMENTO_INEXISTENTE` 422 · `HORARIOS_OBRIGATORIOS` 422 (`REGULAR` sem `horarios`) ·
`VIGENCIA_MUITO_LONGA` 422 (teto de 1 ano sem `dataFim` — evita gerar milhões de linhas; renovar
é nova prescrição)

## Fluxo

1. Validar `medicamentoId` existe e está `ativo`
2. Inserir `prescricao`
3. Se `REGULAR`: para cada dia entre `dataInicio` e `dataFim` (ou +1 ano se `dataFim` nulo,
   truncado no teto), para cada horário em `horarios`, inserir `administracao_medicamento`
   `PENDENTE` com `horario_previsto` combinando data+hora — **na mesma transação** do insert da
   prescrição
4. Auditar `PRESCRICAO_CRIADA` sem `instrucoes` no payload (`SEC-SAUDE`)

## ACID

**A:** prescrição + N administrações `PENDENTE` são uma única transação — nunca existe
prescrição sem suas doses previstas geradas.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | `REGULAR`, 3 horários, 7 dias | 21 administrações `PENDENTE` |
| 2 | `PRN` | zero administrações geradas |
| 3 | `REGULAR` sem `horarios` | 422 |
| 4 | Sem `dataFim` | vigência truncada em 1 ano |
| 5 | `medicamentoId` inativo | 422 |
