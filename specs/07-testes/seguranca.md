# Testes de segurança

- **ID:** TST-004
- **Status:** PRONTA
- **Pré-requisitos:** `02-seguranca/*`

## Confidencialidade

| # | Teste | Esperado |
|---|---|---|
| S-C1 | Grep de PIN em claro no banco | zero |
| S-C2 | Varredura de log da suíte por chaves bloqueadas (`pin`, `token`, ...) | zero |
| S-C3 | `service_role key` no bundle do cliente | ausente |
| S-C4 | `anon` lendo `marcacao`, `escala_dia`, `colaborador`, `audit_log` | negado |
| S-C5 | Colaborador lendo escala de terceiro | 404 |
| S-C6 | Login: matrícula inexistente vs existente | resposta e tempo iguais (±20 ms) |
| S-C7 | PIN em query string em qualquer rota | lint falha |
| S-C8 | `observacao` no payload do colaborador | ausente |
| S-C9 | Headers de segurança | todos presentes |

## Integridade

| # | Teste | Esperado |
|---|---|---|
| S-I1 | Payload com campo extra | 422 |
| S-I2 | `colaboradorId` de terceiro em rota de colaborador | ignorado |
| S-I3 | `UPDATE` em `audit_log` | negado |
| S-I4 | Adulteração de linha da auditoria | cadeia quebrada detectada |
| S-I5 | Handler sem `requireAtor` | lint falha |
| S-I6 | Mutação sem `X-Requested-With` | 403 |
| S-I7 | Injeção de SQL em todo parâmetro de texto | sem efeito |
| S-I8 | Aplicação escrevendo `inicio_em` divergente | trigger sobrescreve |

## Disponibilidade

| # | Teste | Esperado |
|---|---|---|
| S-D1 | 6 logins errados | bloqueio de 15 min |
| S-D2 | Bloqueio expira sozinho | sim |
| S-D3 | Redis fora | login recusa, leitura segue |
| S-D4 | Realtime fora | polling assume |
| S-D5 | Transação deixada aberta | encerrada em 15 s |
| S-D6 | 150 clientes na abertura | p99 < 2 s, zero 5xx |
| S-D7 | Query de relatório no pico | não compete com marcação |

## Autorização (matriz)

Para **cada** rota, testar com: sem sessão, sessão de colaborador, sessão de outro
colaborador, sessão de admin, sessão expirada e sessão revogada. Gerado a partir do
manifesto de rotas — rota nova sem entrada na matriz falha o build.

Essa geração automática é o que impede o furo clássico: alguém cria a rota, esquece o guard,
e ninguém escreve o teste porque ninguém sabe que a rota existe.
