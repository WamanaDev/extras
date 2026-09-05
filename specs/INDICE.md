# Índice de specs

94 documentos. 🔒 = alteração exige revisão humana (`AGENTS.md`).

| ID | Spec | Status | |
|---|---|---|---|
| `—` | [Instruções para sub-agentes](AGENTS.md) | — | 🔒 |
| `—` | [Convenções](CONVENTIONS.md) | — |  |
| `—` | [Specs — Sistema de Escala e Horas Extras](README.md) | — |  |
| `FUND-004` | [Ambiente](00-fundacao/ambiente.md) | PRONTA |  |
| `FUND-000` | [Documento base (histórico)](00-fundacao/documento-base.md) | OBSOLETA |  |
| `FUND-002` | [Glossário](00-fundacao/glossario.md) | PRONTA |  |
| `FUND-003` | [Stack e decisões técnicas](00-fundacao/stack.md) | PRONTA |  |
| `FUND-001` | [Visão geral](00-fundacao/visao-geral.md) | PRONTA |  |
| `DOM-002` | [Blocos de jornada e regra de descanso](01-dominio/blocos-jornada.md) | PRONTA |  |
| `DOM-003` | [Códigos de escala e ausências](01-dominio/codigos-escala.md) | PRONTA |  |
| `DOM-001` | [Escala 12x36 — cálculo por âncora](01-dominio/escala-12x36.md) | PRONTA |  |
| `DOM-004` | [Catálogo de regras de negócio](01-dominio/regras-negocio.md) | PRONTA |  |
| `SEC-ACID` | [ACID — garantias transacionais](02-seguranca/acid.md) | PRONTA | 🔒 |
| `SEC-STRIDE` | [Modelo de ameaças (STRIDE)](02-seguranca/ameacas-stride.md) | PRONTA |  |
| `SEC-AUD` | [Auditoria](02-seguranca/auditoria.md) | PRONTA |  |
| `SEC-CONF` | [Confidencialidade](02-seguranca/confidencialidade.md) | PRONTA | 🔒 |
| `SEC-DISP` | [Disponibilidade](02-seguranca/disponibilidade.md) | PRONTA | 🔒 |
| `SEC-INT` | [Integridade](02-seguranca/integridade.md) | PRONTA | 🔒 |
| `SEC-RLS` | [Políticas RLS](02-seguranca/rls-policies.md) | PRONTA | 🔒 |
| `DB-002` | [Constraints](03-banco/constraints.md) | PRONTA | 🔒 |
| `DB-004` | [Índices](03-banco/indices.md) | PRONTA |  |
| `DB-005` | [Migrations](03-banco/migrations.md) | PRONTA |  |
| `DB-001` | [Modelo de dados](03-banco/modelo-dados.md) | PRONTA |  |
| `DB-003` | [Triggers](03-banco/triggers.md) | PRONTA | 🔒 |
| `—` | [Funções SQL](03-banco/funcoes/README.md) | — |  |
| `FN-002` | [FN-002 — `gerar_escala_mensal`](03-banco/funcoes/fn-002-gerar-escala-mensal.md) | PRONTA |  |
| `FN-003` | [FN-003 — `blocos_ocupados`](03-banco/funcoes/fn-003-blocos-ocupados.md) | PRONTA |  |
| `FN-004` | [FN-004 — `valida_descanso`](03-banco/funcoes/fn-004-valida-descanso.md) | PRONTA | 🔒 |
| `FN-005` | [FN-005 — `marcar_extra`](03-banco/funcoes/fn-005-marcar-extra.md) | PRONTA | 🔒 |
| `FN-006` | [FN-006 — `cancelar_extra`](03-banco/funcoes/fn-006-cancelar-extra.md) | PRONTA |  |
| `FN-007` | [FN-007 — `plantoes_para_colaborador`](03-banco/funcoes/fn-007-plantoes-para-colaborador.md) | PRONTA |  |
| `FN-008` | [FN-008 — `saldo_colaborador`](03-banco/funcoes/fn-008-saldo-colaborador.md) | PRONTA |  |
| `FN-009` | [FN-009 — `cobertura_ciclo`](03-banco/funcoes/fn-009-cobertura-ciclo.md) | PRONTA |  |
| `API-000` | [Contrato comum das rotas](04-api/contrato-comum.md) | PRONTA | 🔒 |
| `API-ADM-CIC-001` | [API-ADM-CIC-001 — `GET /api/admin/ciclos`](04-api/admin-ciclos/API-ADM-CIC-001-listar.md) | PRONTA |  |
| `API-ADM-CIC-002` | [API-ADM-CIC-002 — `POST /api/admin/ciclos`](04-api/admin-ciclos/API-ADM-CIC-002-criar.md) | PRONTA |  |
| `API-ADM-CIC-003` | [API-ADM-CIC-003 — `POST /api/admin/ciclos/:id/gerar-escala`](04-api/admin-ciclos/API-ADM-CIC-003-gerar-escala.md) | PRONTA |  |
| `API-ADM-CIC-004` | [API-ADM-CIC-004 — `PATCH /api/admin/ciclos/:id`](04-api/admin-ciclos/API-ADM-CIC-004-atualizar.md) | PRONTA |  |
| `API-ADM-CIC-005` | [API-ADM-CIC-005 — `POST /api/admin/ciclos/:id/publicar`](04-api/admin-ciclos/API-ADM-CIC-005-publicar.md) | PRONTA |  |
| `API-ADM-CIC-006` | [API-ADM-CIC-006 — `POST /api/admin/ciclos/:id/fechar`](04-api/admin-ciclos/API-ADM-CIC-006-fechar.md) | PRONTA |  |
| `API-ADM-CIC-007` | [API-ADM-CIC-007 — `POST /api/admin/ciclos/:id/duplicar`](04-api/admin-ciclos/API-ADM-CIC-007-duplicar.md) | PRONTA |  |
| `API-ADM-CIC-008` | [API-ADM-CIC-008 — `GET /api/admin/ciclos/:id/cobertura`](04-api/admin-ciclos/API-ADM-CIC-008-cobertura.md) | PRONTA |  |
| `API-ADM-COL-001` | [API-ADM-COL-001 — `GET /api/admin/colaboradores`](04-api/admin-colaboradores/API-ADM-COL-001-listar.md) | PRONTA |  |
| `API-ADM-COL-002` | [API-ADM-COL-002 — `POST /api/admin/colaboradores`](04-api/admin-colaboradores/API-ADM-COL-002-criar.md) | PRONTA | 🔒 |
| `API-ADM-COL-003` | [API-ADM-COL-003 — `PATCH /api/admin/colaboradores/:id`](04-api/admin-colaboradores/API-ADM-COL-003-atualizar.md) | PRONTA |  |
| `API-ADM-COL-004` | [API-ADM-COL-004 — `POST /api/admin/colaboradores/importar`](04-api/admin-colaboradores/API-ADM-COL-004-importar.md) | PRONTA |  |
| `API-ADM-COL-005` | [API-ADM-COL-005 — `POST /api/admin/colaboradores/buscar`](04-api/admin-colaboradores/API-ADM-COL-005-buscar.md) | PRONTA |  |
| `API-ADM-COL-006` | [API-ADM-COL-006 — `POST /api/admin/colaboradores/:id/trocar-escala`](04-api/admin-colaboradores/API-ADM-COL-006-trocar-escala.md) | PRONTA | 🔒 |
| `API-ADM-COL-007` | [API-ADM-COL-007 — `POST /api/admin/colaboradores/:id/resetar-pin`](04-api/admin-colaboradores/API-ADM-COL-007-resetar-pin.md) | PRONTA |  |
| `API-ADM-COL-008` | [API-ADM-COL-008 — `POST /api/admin/colaboradores/:id/desbloquear`](04-api/admin-colaboradores/API-ADM-COL-008-desbloquear.md) | PRONTA |  |
| `API-ADM-COL-009` | [API-ADM-COL-009 — `GET /api/admin/colaboradores/:id/exportar-dados`](04-api/admin-colaboradores/API-ADM-COL-009-exportar-dados.md) | PRONTA |  |
| `API-ADM-COL-010` | [API-ADM-COL-010 — `POST /api/admin/colaboradores/:id/revogar-sessoes`](04-api/admin-colaboradores/API-ADM-COL-010-revogar-sessoes.md) | PRONTA |  |
| `API-ADM-ESC-001` | [API-ADM-ESC-001 — `GET /api/admin/ciclos/:id/escala`](04-api/admin-escala/API-ADM-ESC-001-grade.md) | PRONTA |  |
| `API-ADM-ESC-002` | [API-ADM-ESC-002 — `PATCH /api/admin/escala/:id`](04-api/admin-escala/API-ADM-ESC-002-alterar-dia.md) | PRONTA | 🔒 |
| `API-ADM-ESC-003` | [API-ADM-ESC-003 — `POST /api/admin/escala/lote`](04-api/admin-escala/API-ADM-ESC-003-lote.md) | PRONTA |  |
| `API-ADM-ESC-004` | [API-ADM-ESC-004 — `GET /api/admin/ciclos/:id/escala/export`](04-api/admin-escala/API-ADM-ESC-004-exportar.md) | PRONTA |  |
| `API-ADM-MAR-001` | [API-ADM-MAR-001 — `GET /api/admin/marcacoes`](04-api/admin-marcacoes/API-ADM-MAR-001-listar.md) | PRONTA |  |
| `API-ADM-MAR-002` | [API-ADM-MAR-002 — `POST /api/admin/marcacoes`](04-api/admin-marcacoes/API-ADM-MAR-002-marcar.md) | PRONTA |  |
| `API-ADM-MAR-003` | [API-ADM-MAR-003 — `DELETE /api/admin/marcacoes/:id`](04-api/admin-marcacoes/API-ADM-MAR-003-cancelar.md) | PRONTA |  |
| `API-ADM-PAR-001` | [API-ADM-PAR-001 — `PUT /api/admin/ciclos/:id/participacoes/:colaboradorId`](04-api/admin-participacoes/API-ADM-PAR-001-definir.md) | PRONTA |  |
| `API-ADM-PAR-002` | [API-ADM-PAR-002 — `POST /api/admin/ciclos/:id/participacoes/lote`](04-api/admin-participacoes/API-ADM-PAR-002-lote.md) | PRONTA |  |
| `API-ADM-PLA-001` | [API-ADM-PLA-001 — `POST /api/admin/plantoes`](04-api/admin-plantoes/API-ADM-PLA-001-criar.md) | PRONTA |  |
| `API-ADM-PLA-002` | [API-ADM-PLA-002 — `POST /api/admin/plantoes/lote`](04-api/admin-plantoes/API-ADM-PLA-002-lote.md) | PRONTA |  |
| `API-ADM-PLA-003` | [API-ADM-PLA-003 — `PATCH /api/admin/plantoes/:id`](04-api/admin-plantoes/API-ADM-PLA-003-atualizar.md) | PRONTA | 🔒 |
| `API-ADM-PLA-004` | [API-ADM-PLA-004 — `DELETE /api/admin/plantoes/:id`](04-api/admin-plantoes/API-ADM-PLA-004-remover.md) | PRONTA |  |
| `API-ADM-REL-001` | [API-ADM-REL-001 — `GET /api/admin/relatorios/ciclo/:id`](04-api/admin-relatorios/API-ADM-REL-001-ciclo.md) | PRONTA |  |
| `API-ADM-REL-002` | [API-ADM-REL-002 — `GET /api/admin/relatorios/ciclo/:id/export`](04-api/admin-relatorios/API-ADM-REL-002-exportar.md) | PRONTA |  |
| `API-ADM-REL-003` | [API-ADM-REL-003 — `GET /api/admin/auditoria`](04-api/admin-relatorios/API-ADM-REL-003-auditoria.md) | PRONTA |  |
| `API-ADM-REL-004` | [API-ADM-REL-004 — `GET /api/admin/seguranca/tentativas`](04-api/admin-relatorios/API-ADM-REL-004-seguranca.md) | PRONTA |  |
| `API-AUTH-001` | [API-AUTH-001 — `POST /api/auth/colaborador/login`](04-api/auth/API-AUTH-001-login.md) | PRONTA | 🔒 |
| `API-AUTH-002` | [API-AUTH-002 — `POST /api/auth/colaborador/pin`](04-api/auth/API-AUTH-002-pin.md) | PRONTA | 🔒 |
| `API-AUTH-003` | [API-AUTH-003 — `POST /api/auth/colaborador/definir-pin`](04-api/auth/API-AUTH-003-definir-pin.md) | PRONTA | 🔒 |
| `API-AUTH-004` | [API-AUTH-004 — `POST /api/auth/colaborador/logout`](04-api/auth/API-AUTH-004-logout.md) | PRONTA |  |
| `API-AUTH-005` | [API-AUTH-005 — `GET /api/auth/me`](04-api/auth/API-AUTH-005-me.md) | PRONTA |  |
| `API-AUTH-006` | [API-AUTH-006 — `POST /api/auth/admin/login`](04-api/auth/API-AUTH-006-admin-login.md) | PRONTA |  |
| `API-COL-001` | [API-COL-001 — `GET /api/ciclos/atual`](04-api/colaborador/API-COL-001-ciclo-atual.md) | PRONTA |  |
| `API-COL-002` | [API-COL-002 — `GET /api/minha-escala?cicloId=`](04-api/colaborador/API-COL-002-minha-escala.md) | PRONTA |  |
| `API-COL-003` | [API-COL-003 — `GET /api/plantoes?cicloId=`](04-api/colaborador/API-COL-003-plantoes.md) | PRONTA |  |
| `API-COL-004` | [API-COL-004 — `POST /api/marcacoes`](04-api/colaborador/API-COL-004-marcar.md) | PRONTA | 🔒 |
| `API-COL-005` | [API-COL-005 — `DELETE /api/marcacoes/:id`](04-api/colaborador/API-COL-005-cancelar.md) | PRONTA |  |
| `API-COL-006` | [API-COL-006 — `GET /api/minhas-marcacoes?cicloId=`](04-api/colaborador/API-COL-006-minhas-marcacoes.md) | PRONTA |  |
| `API-COL-007` | [API-COL-007 — `GET /api/meu-saldo?cicloId=`](04-api/colaborador/API-COL-007-saldo.md) | PRONTA |  |
| `RT-001` | [Canais de Realtime](05-realtime/canais.md) | PRONTA |  |
| `RT-002` | [Fallback e reconexão](05-realtime/fallback.md) | PRONTA |  |
| `FE-002` | [Componentes-chave](06-frontend/componentes.md) | PRONTA |  |
| `FE-001` | [Páginas](06-frontend/paginas.md) | PRONTA |  |
| `TST-002` | [Testes de concorrência](07-testes/concorrencia.md) | PRONTA | 🔒 |
| `TST-001` | [Estratégia de testes](07-testes/estrategia.md) | PRONTA |  |
| `TST-003` | [Paridade TS ↔ SQL e virada de escala](07-testes/paridade-escala.md) | PRONTA |  |
| `TST-004` | [Testes de segurança](07-testes/seguranca.md) | PRONTA |  |
| `OPS-004` | [Backup e retenção](08-operacao/backup-restore.md) | PRONTA |  |
| `OPS-001` | [Deploy](08-operacao/deploy.md) | PRONTA |  |
| `OPS-002` | [Observabilidade](08-operacao/observabilidade.md) | PRONTA |  |
| `OPS-003` | [Runbook de incidentes](08-operacao/runbook-incidentes.md) | PRONTA |  |
