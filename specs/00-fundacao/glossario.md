# Glossário

- **ID:** FUND-002
- **Status:** PRONTA

| Termo | Definição |
|---|---|
| **RT** | Unidade residencial. Existem duas: RT1 e RT2. |
| **Ciclo** | Competência mensal. Agrupa escala, plantões ofertados e limites. |
| **Escala base** | Plantões ordinários do colaborador, derivados da âncora. Não são extras. |
| **Âncora** | Data conhecida em que o colaborador trabalhou. Origem do cálculo 12x36. |
| **Periodicidade** | Intervalo em dias entre plantões base. `2` para 12x36. |
| **Bloco** | Intervalo de 12h de um plantão. Diurno `[07:00, 19:00)`, noturno `[19:00, 07:00+1)`. |
| **Cadeia contígua** | Sequência de blocos onde o fim de um é o início exato do próximo. |
| **Extra** | Plantão adicional, voluntário, além da escala base. |
| **Extra cruzada** | Extra numa RT diferente da lotação do colaborador. |
| **Cota / limite** | Máximo de extras que um colaborador pode marcar no ciclo. |
| **Ausência** | Dia da escala base em que o colaborador não trabalha: F, FT, FE. |
| **`presenca`** | Flag do código de escala: o plantão está coberto por esta pessoa? |
| **`ocupaHorario`** | Flag do código de escala: a pessoa está comprometida nesse intervalo? |
| **Janela de marcação** | Período em que o colaborador pode marcar extras no ciclo. |
| **Cobertura** | Nº de colaboradores com `presenca = true` em um dia/turno/RT. |
