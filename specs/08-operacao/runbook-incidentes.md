# Runbook de incidentes

- **ID:** OPS-003
- **Status:** PRONTA

## Contador divergente

**Sintoma:** alerta de reconciliação.

1. Rodar a query de divergência e **salvar o resultado** — é a evidência
2. Verificar `audit_log` dos plantões afetados na janela
3. Procurar erro de aplicação com o mesmo `requestId`
4. Corrigir o contador **manualmente**, um plantão por vez, registrando
5. Só então investigar a causa raiz

Nunca rodar um `UPDATE` em massa antes de entender o que aconteceu. A divergência é o único
sinal disponível; apagá-la apaga a pista.

## Marcação violando jornada

**Sintoma:** alerta do job diário. **Severidade: crítica** — pode ser escala ilegal.

1. Identificar as marcações e os colaboradores
2. Determinar se já foram cumpridas — se sim, é questão trabalhista, escalar imediatamente
3. Se futuras, cancelar via `API-ADM-MAR-003` com motivo, avisando as pessoas
4. Reproduzir em teste antes de qualquer correção de código
5. Post-mortem obrigatório

## Cadeia de auditoria quebrada

**Severidade: crítica.**

1. **Não alterar nada** no `audit_log`
2. Identificar a primeira linha quebrada e o intervalo afetado
3. Verificar acessos administrativos ao banco na janela
4. Preservar backup do estado atual
5. Escalar para responsável de segurança

## Avalanche na abertura

**Sintoma:** p99 alto, 429 em volume, reclamações.

1. Confirmar que não é indisponibilidade real (5xx vs 429)
2. Se rate limit está segurando, **não afrouxar** — está funcionando
3. Se o banco está saturado, escalar o pool
4. No próximo ciclo, escalonar a abertura por RT (`SEC-DISP`)

## Suspeita de comprometimento de conta

1. `API-ADM-COL-010` — revogar sessões
2. `API-ADM-COL-007` — resetar PIN
3. `API-ADM-REL-004` — analisar tentativas e IPs
4. `API-ADM-REL-003` — revisar ações da conta na janela
5. Avisar a pessoa por canal fora do sistema

## Restore

**Último recurso.** Restaurar descarta tudo desde o ponto de restauração.

1. Congelar escritas (ciclo → `FECHADO` ou manutenção)
2. Restaurar em **projeto novo**, nunca por cima
3. Rodar a suíte contra o restaurado
4. Comparar contagens com o esperado
5. Só então redirecionar a aplicação
6. Registrar tudo que se perdeu entre o ponto e o incidente

## Teste trimestral

Restore completo em projeto isolado + suíte + registro do tempo real. Backup não testado não
é backup (`SEC-ACID`).
