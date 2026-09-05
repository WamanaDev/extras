# Fallback e reconexão

- **ID:** RT-002
- **Status:** PRONTA
- **Pré-requisitos:** `RT-001`, `02-seguranca/disponibilidade.md`

## Estados da conexão

```
CONECTANDO → CONECTADO → (queda) → RECONECTANDO → CONECTADO
                                        ↓ (3 falhas)
                                    DEGRADADO (polling 15 s)
```

## Regras

| ID | Regra |
|---|---|
| RT-002.1 | Reconexão com backoff exponencial: 1 s, 2 s, 4 s, 8 s, teto de 30 s |
| RT-002.2 | Após 3 falhas, entra em `DEGRADADO` e liga polling de 15 s |
| RT-002.3 | Em `DEGRADADO`, banner discreto: "atualizando em modo lento" |
| RT-002.4 | Ao reconectar, **refetch completo** — eventos perdidos não são recuperáveis |
| RT-002.5 | Aba em background: polling cai para 60 s; ao voltar ao foco, refetch imediato |
| RT-002.6 | Realtime indisponível **nunca** impede marcar extra |

RT-002.6 é a mais importante. O Realtime é conforto; a marcação é a função do sistema. Uma
implementação que bloqueie o botão enquanto a conexão está caída inverte as prioridades.

RT-002.4 existe porque o Supabase Realtime não garante entrega de eventos ocorridos durante
a desconexão. Assumir que a fila foi preservada produz uma grade desatualizada que *parece*
atualizada — pior que exibir o estado de carregamento.

## Testes de aceitação

| # | Teste | Esperado |
|---|---|---|
| RT2-1 | Realtime derrubado | polling em ≤ 20 s |
| RT2-2 | Reconexão | refetch completo |
| RT2-3 | Marcar em modo degradado | funciona |
| RT2-4 | Aba em background 5 min | polling reduzido, refetch ao voltar |
| RT2-5 | Backoff | respeita o teto |
