# Estratégia de testes

- **ID:** TST-001
- **Status:** PRONTA

## Camadas

| Camada | Ferramenta | Cobre |
|---|---|---|
| Unidade | Vitest | `ancora.ts`, `blocos.ts`, validadores Zod |
| Banco | pgTAP | constraints, triggers, RLS, funções |
| Integração | Vitest + Postgres real | rotas de API ponta a ponta |
| Concorrência | script Node + pool | `TST-002` |
| E2E | Playwright | fluxos de colaborador e admin |
| Segurança | scripts dedicados | `TST-004` |

**Sem banco mockado.** Toda regra crítica vive em PL/pgSQL; mock de banco testaria o mock.
Os testes de integração usam Postgres real em contêiner, com as migrations aplicadas.

## Gates de CI

Bloqueiam merge:

- [ ] `typecheck` e `lint` limpos
- [ ] Unidade e integração verdes
- [ ] pgTAP verde
- [ ] Paridade TS ↔ SQL verde (`TST-003`)
- [ ] Testes de concorrência verdes (`TST-002`)
- [ ] Migrations up + down limpas
- [ ] Varredura de PIN em log: zero
- [ ] `service_role key` ausente do bundle do cliente

## Dados

Seed determinístico com semente fixa. Matrículas sintéticas inexistentes em produção.
**Nunca** dump de produção (`SEC-CONF`).

## Cobertura

Não perseguimos percentual. Perseguimos: **toda regra do catálogo `DOM-004` tem ao menos um
teste que falha se a regra for removida.** Um teste que continua passando com a regra
deletada não testa a regra.
