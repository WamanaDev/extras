# API-ADM-COL-004 — `POST /api/admin/colaboradores/importar`

- **ID:** API-ADM-COL-004
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `04-api/contrato-comum.md`, `02-seguranca/confidencialidade.md`
- **Entregáveis:** `src/app/api/admin/colaboradores/importar/route.ts`

## Objetivo

Importação em massa por CSV. Caminho de carga inicial do sistema.

## Contrato

### Request
`multipart/form-data` com CSV: `matricula;nome;rt;turno;ancora`
Campo `preview: boolean`.

### Response 200
```ts
{ validos: number, erros: Array<{ linha, campo, problema }>,
  importados?: number, preview?: Array<{...}> }
```

## Fluxo

1. Parse com limite de 5 MB e 1.000 linhas
2. Validar linha a linha (âncora, RT, matrícula duplicada no arquivo e no banco)
3. `preview = true` → devolver relatório sem gravar
4. `$transaction` com todas as linhas válidas
5. Auditar `COLABORADOR_IMPORTADO_LOTE` com contagens e o hash do arquivo

## ACID

**A:** tudo ou nada. Importação parcial de 200 pessoas deixa o estado ambíguo e a
segunda tentativa esbarra em duplicatas.
**C:** unicidade de matrícula validada pela constraint, não só pela aplicação.

## CIA

**C:** o CSV contém dados pessoais de toda a equipe — é um arquivo sensível que trafega no
sistema. Nunca gravado em disco; processado em memória e descartado. O conteúdo não vai para
log nem para a auditoria; só o hash SHA-256 do arquivo, contagens e a lista de erros
(que referencia número de linha, não valor).
**D:** teto de 1.000 linhas e 5 MB.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | CSV válido de 80 linhas | 80 importados |
| 2 | `preview` | nada gravado |
| 3 | Uma linha inválida | rollback total, erro apontando a linha |
| 4 | Matrícula duplicada no arquivo | erro apontando as duas linhas |
| 5 | Arquivo persistido em disco | não |
| 6 | 2.000 linhas | 422 |
