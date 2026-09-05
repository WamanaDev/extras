# API-ADM-REL-004 — `GET /api/admin/seguranca/tentativas`

- **ID:** API-ADM-REL-004
- **Status:** PRONTA
- **Ator:** Admin
- **Pré-requisitos:** `02-seguranca/disponibilidade.md`
- **Entregáveis:** `src/app/api/admin/seguranca/tentativas/route.ts`

## Objetivo

Painel de segurança: tentativas de login suspeitas, contas bloqueadas, sessões ativas.

## Contrato

### Query
`?janela=24h|7d&apenasSuspeitas=true`

### Response 200
```ts
{ contasBloqueadas: Array<{ colaboradorId, nome, matricula, bloqueadoAte, falhas }>,
  ipsSuspeitos: Array<{ ip, tentativas, matriculasDistintas, primeiraEm, ultimaEm }>,
  sessoesAtivas: number,
  resumo: { tentativas, falhas, taxaFalha } }
```

## Fluxo

1. Agregar `tentativa_login` na janela
2. Marcar como suspeito IP com > 3 matrículas distintas ou > 10 falhas

## ACID

Leitura.

## CIA

**C:** só admin. IP é dado pessoal indireto — a tela existe para segurança, não para
monitorar deslocamento de funcionário, e a retenção de 90 dias limita o uso
(`SEC-CONF`).
**I:** `matriculasDistintas` por IP é o sinal mais útil: um colaborador esquecido erra o
próprio PIN várias vezes; um ataque tenta matrículas diferentes do mesmo IP.
**D:** este painel é o que transforma o rate limit de mecanismo silencioso em algo
acionável — sem ele, ninguém saberia que um ataque aconteceu.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| 1 | Contas bloqueadas | listadas |
| 2 | IP com 5 matrículas distintas | marcado suspeito |
| 3 | Colaborador errando o próprio PIN | não marcado suspeito |
| 4 | Janela 7d | agrega corretamente |
| 5 | Tentativas com mais de 90 dias | ausentes (expurgo) |
