# Backup e retenção

- **ID:** OPS-004
- **Status:** PRONTA

## Política

| Mecanismo | Frequência | Retenção | Local |
|---|---|---|---|
| PITR (Supabase) | contínuo | 7 dias | provedor |
| `pg_dump` cifrado | diário | 30 dias | bucket em outra região |
| Dump mensal | mensal | 12 meses | armazenamento frio |

Cifra com chave gerenciada fora do provedor do banco — backup cifrado com chave guardada no
mesmo lugar do banco não protege contra comprometimento do provedor.

## Alvos

| Métrica | Alvo | Verificação |
|---|---|---|
| RPO | 5 min | teste trimestral |
| RTO | 4 h | teste trimestral |

## Expurgo

| Dado | Retenção |
|---|---|
| `tentativa_login` | 90 dias |
| Sessões expiradas | 30 dias |
| `audit_log` | 5 anos, depois `ator_id` anonimizado |
| `escala_dia`, `marcacao` | 5 anos |
| Colaborador desligado | 5 anos após desligamento; `pin_hash` apagado, nome pseudonimizado |

O expurgo é job, não tarefa manual. Falha do job é alerta — dado retido além do prazo é
exposição desnecessária e descumprimento da própria política.

## Teste trimestral

1. Restaurar o dump mais recente em projeto isolado
2. Aplicar migrations pendentes
3. Rodar a suíte completa
4. Comparar contagens por tabela
5. Cronometrar e registrar o RTO real
6. Destruir o projeto de teste

Registro em `08-operacao/`, com data, tempo e problemas encontrados.
