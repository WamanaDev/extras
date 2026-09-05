# Códigos de escala e ausências

- **ID:** DOM-003
- **Status:** PRONTA
- **Entregáveis:** seed de `codigo_escala`, `src/lib/escala/codigos.ts`

## Modelo

`codigo_escala` é tabela, não enum. O admin cadastra códigos novos (atestado, férias,
licença) sem deploy.

| Código | Descrição | `presenca` | `ocupaHorario` | `remunerada` | `bloqueado` |
|---|---|---|---|---|---|
| `D` | Disponível — trabalha | ✅ | ✅ | ✅ | ✅ (fixo) |
| `F` | Folga | ❌ | ❌ | conforme regra | ✅ (fixo) |
| `FE` | Férias | ❌ | ✅ | ✅ | ✅ (fixo) |
| `FT` | Folga Treinamento | ❌ | ✅ | ✅ | ❌ (preset comum) |

`bloqueado` (revisão de DOM-003.6 — pedido do usuário, ver `_conflitos.md`): só D/F/FE
são fixos/padrão do sistema. `FT` deixou de ser especial — é só um preset que já vem
cadastrado, mas o admin pode editar suas flags/descrição ou desativá-lo como qualquer
código criado por ele. Todo código novo nasce com `bloqueado = false`; não existe rota
de API que altere essa coluna depois de criada.

## As duas flags

São perguntas diferentes e é erro tratá-las como uma só:

- **`presenca`** — *"esta pessoa cobre o plantão?"*
  Usada na impressão da escala e no cálculo de cobertura por RT/dia/turno.
- **`ocupaHorario`** — *"esta pessoa está comprometida neste intervalo?"*
  Usada na regra de descanso (`DOM-002`).

`FT` e `FE` respondem **não** à primeira e **sim** à segunda: quem está em treinamento não
cobre o plantão, mas também não pode encadear 24h de extra em volta.

Se na prática o TRE liberar a pessoa para extras, é troca de flag no cadastro — não é código.

## Regras

| ID | Regra |
|---|---|
| DOM-003.1 | Só o admin lança ou altera ausência. O colaborador visualiza. |
| DOM-003.2 | Ausência não consome cota de extras. São controles independentes. |
| DOM-003.3 | Alterar ausência em dia com extra marcada exige confirmação e gera `audit_log`. |
| DOM-003.4 | Código com `presenca = true` conta na cobertura mínima da RT. |
| DOM-003.5 | Excluir código em uso é proibido; desativa-se (`ativo = false`). |
| DOM-003.6 | Código `bloqueado` (D, F, FE) é imutável: não pode ser desativado nem ter flags alteradas. Revisado a pedido do usuário — antes só `D`. |

## Impressão

`cor` é usada na legenda e no badge da célula. Deve ter contraste mínimo 4.5:1 sobre branco
**e** ser distinguível em impressão monocromática — por isso a célula mostra sempre o texto
do código, nunca só a cor.
