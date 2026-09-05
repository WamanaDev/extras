# API-ADM-ESC-003 — `POST /api/admin/escala/lote`

- **ID:** API-ADM-ESC-003
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `API-ADM-ESC-002`
- **Entregáveis:** `src/app/api/admin/escala/lote/route.ts`

## Objetivo

Lança a mesma ausência num intervalo de datas — férias, licença, treinamento de vários dias.

## Contrato

### Request
```ts
{ colaboradorId: string, de: string, ate: string, codigo: string,
  observacao?: string, confirmarImpacto?: boolean }
```

### Response 200
```ts
{ alterados: number, ignorados: number,
  impacto: { extrasAfetadas: [...], diasComDeficit: [...] } }
```

## Fluxo

1. Advisory lock do colaborador, **uma vez** para o lote inteiro
2. Selecionar os `escala_dia` do intervalo (dias sem escala são ignorados, não criados)
3. Calcular impacto agregado
4. Sem confirmação e com impacto → 409
5. Aplicar em massa, revalidar jornada uma vez ao final
6. Auditar **uma** entrada com o intervalo, não uma por dia

## ACID

**A:** tudo ou nada. Metade das férias lançada é pior que nenhuma.
**I:** um advisory lock para o lote, não um por dia — reduz contenção e mantém a ordem de
locks previsível.
**D:** intervalo limitado a 92 dias; acima disso, 422.

## CIA

**I:** dias fora da escala base são ignorados, nunca criados. Criar linha para dia não
trabalhado inventaria plantão inexistente.
**R:** uma entrada de auditoria com o intervalo, legível meses depois — 30 entradas
idênticas escondem o que aconteceu.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Intervalo de 15 dias | só dias com escala alterados |
| 2 | Falha no meio | rollback total |
| 3 | Extras no intervalo | listadas no impacto |
| 4 | Intervalo de 200 dias | 422 |
| 5 | `de > ate` | 422 |
| 6 | Auditoria | uma entrada com o intervalo |
