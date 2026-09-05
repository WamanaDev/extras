# Funções SQL

Uma spec por função. Toda regra crítica de negócio vive aqui, não na aplicação
(`FUND-003`, D-01): múltiplas instâncias serverless não compartilham estado; só o banco
serializa.

| ID | Função | Papel | Transacional |
|---|---|---|---|
| `FN-001` | `preencher_intervalo` | Trigger de cálculo temporal | — |
| `FN-002` | `gerar_escala_mensal` | Materializa a escala do ciclo | sim |
| `FN-003` | `blocos_ocupados` | Blocos ocupados de um colaborador | leitura |
| `FN-004` | `valida_descanso` | Sobreposição + cadeia contígua | leitura |
| `FN-005` | `marcar_extra` | Marca extra com todas as validações | sim |
| `FN-006` | `cancelar_extra` | Cancela e devolve a vaga | sim |
| `FN-007` | `plantoes_para_colaborador` | Grade avaliada com motivo | leitura |
| `FN-008` | `saldo_colaborador` | Limite, usadas, restantes | leitura |
| `FN-009` | `cobertura_ciclo` | Dias abaixo da cobertura mínima | leitura |

`FN-001` está descrita em `03-banco/triggers.md`.
