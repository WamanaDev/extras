# Páginas

- **ID:** FE-001
- **Status:** PRONTA
- **Pré-requisitos:** `04-api/*`

## Mapa

```
/login                          → matrícula                          API-AUTH-001
/login/pin                      → PIN                                 API-AUTH-002
/login/definir-pin              → primeiro acesso                      API-AUTH-003
/admin/login                    → e-mail + senha + MFA                API-AUTH-006

/(colaborador)
  /painel                       → saldo, próximos plantões             API-COL-001/007
  /minha-escala                 → calendário: base + extras + ausências API-COL-002
  /plantoes                     → grade de extras, realtime            API-COL-003/004
  /minhas-extras                → marcações + cancelamento             API-COL-006/005

/admin
  /                             → cobertura, vagas em aberto, alertas  API-ADM-CIC-008
  /ciclos                       → competências                         API-ADM-CIC-001
  /ciclos/[id]                  → config, publicar, fechar             API-ADM-CIC-004/005/006
  /ciclos/[id]/escala           → grade editável                       API-ADM-ESC-001/002/003
  /ciclos/[id]/escala/imprimir  → A4 paisagem                          API-ADM-ESC-004
  /ciclos/[id]/plantoes         → criação em lote, vagas               API-ADM-PLA-001..004
  /ciclos/[id]/participacoes    → limites, cruzada, bloqueios          API-ADM-PAR-001/002
  /ciclos/[id]/marcacoes        → conferência                          API-ADM-MAR-001..003
  /colaboradores                → CRUD + importação                    API-ADM-COL-001..004
  /colaboradores/[id]           → dados, escala, PIN, sessões          API-ADM-COL-003/006..010
  /relatorios                   → consolidado                          API-ADM-REL-001/002
  /auditoria                    → trilha                               API-ADM-REL-003
  /seguranca                    → tentativas, bloqueios                API-ADM-REL-004
  /configuracoes                → RTs, códigos, admins
```

## Regras transversais

| ID | Regra |
|---|---|
| FE-001.1 | Guard de sessão no `layout.tsx` de cada grupo; sem sessão → redirect |
| FE-001.2 | Toda tela tem estado de carregamento, vazio e erro. Nunca tela branca |
| FE-001.3 | Mensagem de erro vem da API (`mensagem`); o cliente não inventa texto |
| FE-001.4 | `409` de regra de negócio não é toast de falha — é informação inline no lugar da ação |
| FE-001.5 | Nenhuma decisão de bloqueio é calculada no cliente; vem de `API-COL-003` |
| FE-001.6 | Ação destrutiva exige confirmação com o impacto listado |
| FE-001.7 | Acessível por teclado; contraste mínimo 4.5:1 |
| FE-001.8 | Nada de PIN em `localStorage`, `sessionStorage` ou URL |

FE-001.4 muda a sensação do produto no pico: no minuto da abertura, `SEM_VAGA` é o resultado
mais comum e esperado. Tratá-lo como erro faz o sistema parecer quebrado quando está
funcionando exatamente como deveria.
