# API-ADM-MAR-002 — `POST /api/admin/marcacoes`

- **ID:** API-ADM-MAR-002
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `FN-005`, `02-seguranca/acid.md`
- **Entregáveis:** `src/app/api/admin/marcacoes/route.ts`

## Objetivo

Aloca extra em nome de um colaborador — cobertura de emergência, acerto fora do prazo.

## Contrato

### Request

Exatamente um entre `plantaoId` (plantão já existente) e `novoPlantao` (cria um plantão
exclusivo para esta marcação, no mesmo passo):

```ts
{
  plantaoId?: string;
  novoPlantao?: {
    cicloId: string; rtId: string; data: string /* AAAA-MM-DD */; tipo: 'DIURNO' | 'NOTURNO';
    horaInicio?: string; horaFim?: string; permiteCruzada?: boolean | null;
  };
  colaboradorId: string;
  motivo: string;
}
```

`plantaoId` e `novoPlantao` são mutuamente exclusivos — exatamente um dos dois deve estar
presente (`422` se ambos ou nenhum).

### Response 201
Igual a `API-COL-004`, acrescido de `origem: 'ADMIN'`.

## Fluxo

1. `$transaction` (`emTransacao`, `SEC-ACID`) — nunca duas chamadas HTTP sequenciais para
   criar o plantão e depois marcar (`specs/AGENTS.md`: nenhuma mutação nasce fora de
   transação):
   - Se `novoPlantao` foi informado: `criarPlantao` (API-ADM-PLA-001) primeiro, com
     `vagasTotais: 1` fixo — o plantão nasce exclusivo para esta pessoa, nunca uma vaga
     extra reaproveitável por outra marcação. Reaproveita as regras de `criarPlantao`
     (`CICLO_FECHADO`, `DATA_FORA_DO_CICLO`, `PLANTAO_JA_EXISTE`) sem duplicá-las.
   - `marcar_extra(plantaoId, colaboradorId, 'ADMIN', ip, ua)` em seguida, no plantão recém-
     criado ou no `plantaoId` informado.
   - Se `marcar_extra` rejeitar (`EM_AUSENCIA`, `EXCEDE_JORNADA`, `SEM_VAGA`, etc.), o
     `ROLLBACK` desfaz também a criação do plantão — nunca sobra um plantão vazio órfão de
     uma marcação que não vingou.
2. Auditar `EXTRA_MARCADA` com `origem: ADMIN`, ator = admin, motivo e
   `plantaoCriadoParaEstaMarcacao: boolean` (indica se este plantão nasceu junto com a
   marcação ou já existia)
3. Broadcast

## ACID

Mesmas garantias de `FN-005`: advisory lock + `FOR UPDATE`. Nenhum atalho por ser admin.

## CIA

**I:** `origem = 'ADMIN'` pula **apenas** a checagem de janela (RN-27). Jornada, limite,
vaga e cruzada continuam valendo. O admin pode alocar fora do prazo; não pode criar escala
ilegal — a regra de 36h existe por segurança do trabalhador, não por conveniência
administrativa.
**R:** `motivo` obrigatório e ator registrado. Sem isso, o colaborador vê uma extra que não
marcou e não há como explicar de onde veio.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Alocação válida | 201, `origem = ADMIN` |
| 2 | Fora da janela | permitido |
| 3 | Criando 36h | `EXCEDE_JORNADA` |
| 4 | Acima do limite | `LIMITE_ATINGIDO` |
| 5 | Sem vaga | `SEM_VAGA` |
| 6 | Cruzada bloqueada | `CRUZADA_BLOQUEADA` |
| 7 | Sem motivo | 422 |
| 8 | Auditoria | ator = admin, motivo presente |
| 9 | `novoPlantao` informado | plantão criado com `vagasTotais: 1`, marcação nele, `plantaoCriadoParaEstaMarcacao: true` na auditoria |
| 10 | `novoPlantao` + `marcar_extra` rejeita (ex. `EXCEDE_JORNADA`) | plantão recém-criado desfeito (ROLLBACK), nenhuma linha órfã |
| 11 | `plantaoId` e `novoPlantao` juntos, ou nenhum dos dois | 422 |
