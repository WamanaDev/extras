# Catálogo de regras de negócio

- **ID:** DOM-004
- **Status:** PRONTA

Fonte única de verdade. Specs de rota e de função **referenciam** por ID; não redefinem.

## Escala base

| ID | Regra | Onde vive |
|---|---|---|
| RN-01 | Colaborador tem turno padrão, âncora e periodicidade (padrão 2) | schema |
| RN-02 | Dia trabalhado é derivado da âncora; paridade é consequência | `FN-002` |
| RN-03 | Troca de escala cria registro com vigência; passado intacto | `API-ADM-COL-006` |
| RN-04 | Escala é materializada em `escala_dia` com código `D` | `FN-002` |
| RN-05 | Regerar escala é idempotente e preserva ausências | `FN-002` |
| RN-06 | Ausências: F, FT, FE + códigos criados pelo admin | `DOM-003` |
| RN-07 | `presenca` = cobre plantão; `ocupaHorario` = conta p/ descanso | `DOM-003` |
| RN-08 | Só admin lança ausência | `API-ADM-ESC-002` |
| RN-09 | Ausência não consome cota de extras | — |
| RN-10 | Alterar ausência com extra marcada exige confirmação + log | `API-ADM-ESC-002` |

## Jornada

| ID | Regra | Onde vive |
|---|---|---|
| RN-11 | Plantão = bloco de 12h; diurno `[07,19)`, noturno `[19,07+1)` | trigger |
| RN-12 | Cadeia contígua não excede 2 blocos (24h) | `FN-004` |
| RN-13 | Extra não pode sobrepor o próprio plantão | `FN-004` |
| RN-14 | Extra imediatamente antes ou depois é permitida | `FN-004` |
| RN-15 | Blocos com `ocupaHorario` contam mesmo sem presença | `FN-003` |
| RN-16 | Extra em dia com ausência é bloqueada salvo `permiteExtraEmFolga`. Extra NOTURNA cruza meia-noite: bloqueia se o dia do plantão **ou** o dia seguinte tiver ausência (qualquer código ≠ `D`) — extra DIURNA continua checando só o próprio dia | `FN-005`, `FN-007` |
| RN-17 | `maxBlocosSeguidos` é configurável por ciclo (padrão 2, teto 3) | schema |

## Extras

| ID | Regra | Onde vive |
|---|---|---|
| RN-18 | Plantão só visível com ciclo PUBLICADO e dentro da janela | `FN-007` |
| RN-19 | Por padrão só marca na própria RT | `FN-005` |
| RN-20 | Cruzada: `participacao` → `plantao` → `ciclo` → `false` | `FN-005` |
| RN-21 | Limite = `limiteOverride` ?? `ciclo.limitePadrao` | `FN-005` |
| RN-22 | Limite atingido bloqueia na UI **e** no banco | `FN-005` |
| RN-23 | Nunca ultrapassar `vagasTotais`; checagem atômica | `FN-005` |
| RN-24 | Colaborador cancela até `fechamentoMarcacao`; depois só admin | `API-COL-005` |
| RN-25 | Ciclo FECHADO é imutável | `FN-005`, `FN-006` |
| RN-26 | Reduzir `vagasTotais` abaixo de `vagasOcupadas` é bloqueado | `API-ADM-PLA-003` |
| RN-27 | Admin marca por terceiros com as mesmas validações de jornada | `API-ADM-MAR-002` |
| RN-28 | Desativar cruzada não desfaz marcações existentes; avisa | `API-ADM-CIC-004` |

## Autenticação

| ID | Regra | Onde vive |
|---|---|---|
| RN-29 | Login = matrícula + PIN; PIN definido no 1º acesso | `API-AUTH-001..003` |
| RN-30 | PIN não trivial: sequência ou repetição | `API-AUTH-003` |
| RN-31 | Rate limit por matrícula e por IP com bloqueio temporário | `SEC-DISP` |
| RN-32 | Sessão 8h, deslizante até 12h, revogável | `API-AUTH-004` |
| RN-33 | Ação sensível registra IP e user-agent | `SEC-AUD` |
| RN-34 | Erro de credencial sempre genérico e de tempo constante | `API-AUTH-001` |
