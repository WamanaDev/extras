# Specs — Sistema de Escala e Horas Extras

Repositório de especificações. Cada arquivo é **auto-contido o suficiente para um sub-agente
trabalhar sozinho**, declarando no topo o que precisa ler antes e o que produz.

## Como navegar

| Pasta | Conteúdo |
|---|---|
| `00-fundacao/` | Visão geral, glossário, stack, ambiente |
| `01-dominio/` | Modelo de dados, escala 12x36, jornada, regras de negócio |
| `02-seguranca/` | ACID, Confidencialidade, Integridade, Disponibilidade, STRIDE, RLS |
| `03-banco/` | Schema, migrations, constraints, triggers, uma spec por função SQL |
| `04-api/` | Uma spec por rota |
| `05-realtime/` | Canais, publication, broadcast |
| `06-frontend/` | Uma spec por página e por componente crítico |
| `07-testes/` | Estratégia, concorrência, paridade, segurança |
| `08-operacao/` | Deploy, backup, observabilidade, runbooks |

## Ordem de implementação

```
02-seguranca/*  ──┐
01-dominio/*    ──┼──▶ 03-banco/* ──▶ 04-api/* ──▶ 06-frontend/* ──▶ 05-realtime/*
00-fundacao/*   ──┘                                     │
                                                        └──▶ 07-testes/* (em paralelo)
```

Nada em `04-api/` começa antes das funções SQL correspondentes existirem em `03-banco/funcoes/`.
As regras de `02-seguranca/acid.md` e `02-seguranca/integridade.md` são **pré-requisito de leitura**
para qualquer spec que escreva no banco.

## Identificadores

Cada spec tem um ID estável (`API-COL-004`, `FN-005`, `SEC-ACID`). Use o ID em commits,
PRs e ao referenciar specs entre si. IDs não são reciclados.

## Estado

Cada spec tem um campo `Status` no cabeçalho: `RASCUNHO`, `PRONTA`, `EM_IMPLEMENTACAO`,
`IMPLEMENTADA`, `OBSOLETA`. Sub-agente só pega spec `PRONTA`.
